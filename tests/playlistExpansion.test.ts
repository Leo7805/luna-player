import { describe, expect, it } from 'vitest';
import {
  collectFolderIds,
  folderContainsSearchMatch,
  setAllFolderExpansion,
  toggleFolderExpansion,
} from '../src/components/PlaylistFolder';
import { FolderNode } from '../src/types/video';

const video = (id: string, name: string) => ({
  id,
  name,
  relativePath: id,
  size: 1,
  lastModified: 1,
});

const tree: FolderNode = {
  id: 'root',
  name: 'Root',
  relativePath: '',
  videos: [],
  totalVideoCount: 2,
  subfolders: [
    {
      id: 'one',
      name: 'One',
      relativePath: 'one',
      videos: [video('one/a.mp4', 'a.mp4')],
      totalVideoCount: 1,
      subfolders: [],
    },
    {
      id: 'two',
      name: 'Two',
      relativePath: 'two',
      videos: [video('two/b.mp4', 'b.mp4')],
      totalVideoCount: 1,
      subfolders: [],
    },
  ],
};

describe('playlist expansion state', () => {
  const folderIds = collectFolderIds(tree);

  it('handles initial, partial, and repeated global transitions', () => {
    expect(setAllFolderExpansion(folderIds, true)).toEqual(new Set(['one', 'two']));
    expect(setAllFolderExpansion(folderIds, false)).toEqual(new Set());
    expect(setAllFolderExpansion(folderIds, true)).toEqual(new Set(['one', 'two']));
  });

  it('toggles an individual folder without losing other folders', () => {
    const partiallyExpanded = toggleFolderExpansion(new Set(['one']), 'two');
    expect(partiallyExpanded).toEqual(new Set(['one', 'two']));
    expect(toggleFolderExpansion(partiallyExpanded, 'one')).toEqual(new Set(['two']));
  });

  it('finds search matches through nested folders and clears them predictably', () => {
    expect(folderContainsSearchMatch(tree, 'b.mp4')).toBe(true);
    expect(folderContainsSearchMatch(tree, 'missing')).toBe(false);
    expect(folderContainsSearchMatch(tree, '')).toBe(false);
  });
});
