import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Page } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const SAMPLE_LIBRARY_PATH = path.resolve(__dirname, '../../fixtures/sample-library');

export interface FixtureFile {
  relativePath: string;
  name: string;
  base64: string;
  mimeType: string;
}

/**
 * Reads all files from a directory recursively on disk and converts them to base64 fixtures.
 */
export function loadFixtureDirectory(dirPath: string): FixtureFile[] {
  const results: FixtureFile[] = [];

  function walk(currentDir: string, currentRelative: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = currentRelative ? `${currentRelative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const buffer = fs.readFileSync(fullPath);
        const mimeType = entry.name.endsWith('.mp4')
          ? 'video/mp4'
          : entry.name.endsWith('.txt')
          ? 'text/plain'
          : 'application/octet-stream';
        results.push({
          relativePath: relPath,
          name: entry.name,
          base64: buffer.toString('base64'),
          mimeType,
        });
      }
    }
  }

  walk(dirPath, '');
  return results;
}

/**
 * Injects a mock implementation of window.showDirectoryPicker into the page.
 */
export async function installDirectoryPickerMock(
  page: Page,
  rootFolderName: string,
  fixtureFiles: FixtureFile[],
  options?: { shouldDenyPermission?: boolean; shouldAbort?: boolean }
) {
  await page.addInitScript(
    ({ rootName, files, opts }) => {
      if (opts?.shouldAbort) {
        window.showDirectoryPicker = async () => {
          const err = new DOMException('The user aborted a request.', 'AbortError');
          throw err;
        };
        return;
      }

      if (opts?.shouldDenyPermission) {
        window.showDirectoryPicker = async () => {
          const err = new DOMException('Permission was denied.', 'NotAllowedError');
          throw err;
        };
        return;
      }

      // Convert base64 files to in-memory Blob/File representations
      interface NodeItem {
        kind: 'directory' | 'file';
        name: string;
        children?: Map<string, NodeItem>;
        file?: File;
      }

      const rootNode: NodeItem = {
        kind: 'directory',
        name: rootName,
        children: new Map(),
      };

      for (const item of files) {
        const parts = item.relativePath.split('/');
        let current = rootNode;

        for (let i = 0; i < parts.length - 1; i++) {
          const folderName = parts[i];
          if (!current.children!.has(folderName)) {
            current.children!.set(folderName, {
              kind: 'directory',
              name: folderName,
              children: new Map(),
            });
          }
          current = current.children!.get(folderName)!;
        }

        const fileName = parts[parts.length - 1];
        // Decode base64 to Uint8Array
        const binaryString = atob(item.base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let j = 0; j < len; j++) {
          bytes[j] = binaryString.charCodeAt(j);
        }

        const fileObj = new File([bytes], fileName, {
          type: item.mimeType,
          lastModified: 1700000000000,
        });

        current.children!.set(fileName, {
          kind: 'file',
          name: fileName,
          file: fileObj,
        });
      }

      function createHandle(node: NodeItem): any {
        if (node.kind === 'file') {
          return {
            kind: 'file',
            name: node.name,
            queryPermission: async () => 'granted',
            requestPermission: async () => 'granted',
            getFile: async () => node.file!,
          };
        }

        return {
          kind: 'directory',
          name: node.name,
          queryPermission: async () => 'granted',
          requestPermission: async () => 'granted',
          async *values() {
            for (const child of node.children!.values()) {
              yield createHandle(child);
            }
          },
        };
      }

      const rootHandle = createHandle(rootNode);

      window.showDirectoryPicker = async () => {
        return rootHandle;
      };
    },
    { rootName: rootFolderName, files: fixtureFiles, opts: options }
  );
}
