import { describe, it, expect } from 'vitest';
import {
  buildFolderTree,
  flattenTreeToDfsPlaylist,
  isSupportedVideoFile,
} from '../src/utils/videoTree';
import { VideoItem } from '../src/types/video';

describe('videoTree', () => {
  it('identifies supported video extensions', () => {
    expect(isSupportedVideoFile('movie.mp4')).toBe(true);
    expect(isSupportedVideoFile('clip.WEBM')).toBe(true);
    expect(isSupportedVideoFile('archive.mkv')).toBe(true);
    expect(isSupportedVideoFile('sample.mov')).toBe(true);
    expect(isSupportedVideoFile('video.m4v')).toBe(true);
    expect(isSupportedVideoFile('music.mp3')).toBe(false);
    expect(isSupportedVideoFile('notes.txt')).toBe(false);
    expect(isSupportedVideoFile('.DS_Store')).toBe(false);
  });

  it('builds a naturally sorted tree and produces deterministic DFS ordering', () => {
    const rawVideos: VideoItem[] = [
      {
        id: 'Season 2/Ep 10.mp4',
        name: 'Ep 10.mp4',
        relativePath: 'Season 2/Ep 10.mp4',
        size: 100,
        lastModified: 1000,
      },
      {
        id: 'Season 1/Ep 2.mp4',
        name: 'Ep 2.mp4',
        relativePath: 'Season 1/Ep 2.mp4',
        size: 100,
        lastModified: 1000,
      },
      {
        id: 'Root Promo 2.mp4',
        name: 'Root Promo 2.mp4',
        relativePath: 'Root Promo 2.mp4',
        size: 100,
        lastModified: 1000,
      },
      {
        id: 'Season 1/Ep 10.mp4',
        name: 'Ep 10.mp4',
        relativePath: 'Season 1/Ep 10.mp4',
        size: 100,
        lastModified: 1000,
      },
      {
        id: 'Root Promo 1.mp4',
        name: 'Root Promo 1.mp4',
        relativePath: 'Root Promo 1.mp4',
        size: 100,
        lastModified: 1000,
      },
      {
        id: 'Season 1/Ep 1.mp4',
        name: 'Ep 1.mp4',
        relativePath: 'Season 1/Ep 1.mp4',
        size: 100,
        lastModified: 1000,
      },
      {
        id: 'Season 2/Ep 2.mp4',
        name: 'Ep 2.mp4',
        relativePath: 'Season 2/Ep 2.mp4',
        size: 100,
        lastModified: 1000,
      },
    ];

    const tree = buildFolderTree('My Series', rawVideos);

    // Root folder checks
    expect(tree.name).toBe('My Series');
    expect(tree.totalVideoCount).toBe(7);
    expect(tree.videos.map((v) => v.name)).toEqual(['Root Promo 1.mp4', 'Root Promo 2.mp4']);
    expect(tree.subfolders.map((f) => f.name)).toEqual(['Season 1', 'Season 2']);

    // Season 1 sorting checks
    const season1 = tree.subfolders[0];
    expect(season1.videos.map((v) => v.name)).toEqual(['Ep 1.mp4', 'Ep 2.mp4', 'Ep 10.mp4']);

    // Season 2 sorting checks
    const season2 = tree.subfolders[1];
    expect(season2.videos.map((v) => v.name)).toEqual(['Ep 2.mp4', 'Ep 10.mp4']);

    // DFS order:
    // 1. Root videos: Root Promo 1, Root Promo 2
    // 2. Season 1 videos: Ep 1, Ep 2, Ep 10
    // 3. Season 2 videos: Ep 2, Ep 10
    const dfs = flattenTreeToDfsPlaylist(tree);
    expect(dfs.map((v) => v.relativePath)).toEqual([
      'Root Promo 1.mp4',
      'Root Promo 2.mp4',
      'Season 1/Ep 1.mp4',
      'Season 1/Ep 2.mp4',
      'Season 1/Ep 10.mp4',
      'Season 2/Ep 2.mp4',
      'Season 2/Ep 10.mp4',
    ]);
  });

  it('prunes empty folders and subfolders', () => {
    // Only a deeply nested video
    const rawVideos: VideoItem[] = [
      {
        id: 'Parent/Child/Grandchild/video.mp4',
        name: 'video.mp4',
        relativePath: 'Parent/Child/Grandchild/video.mp4',
        size: 50,
        lastModified: 100,
      },
    ];

    const tree = buildFolderTree('Library', rawVideos);
    expect(tree.subfolders.length).toBe(1);
    expect(tree.subfolders[0].name).toBe('Parent');
    expect(tree.subfolders[0].subfolders[0].name).toBe('Child');
    expect(tree.subfolders[0].subfolders[0].subfolders[0].name).toBe('Grandchild');
    expect(tree.totalVideoCount).toBe(1);
  });

  it('keeps identical filenames in different folders distinct', () => {
    const rawVideos: VideoItem[] = [
      {
        id: 'A/clip.mp4',
        name: 'clip.mp4',
        relativePath: 'A/clip.mp4',
        size: 100,
        lastModified: 1000,
      },
      {
        id: 'B/clip.mp4',
        name: 'clip.mp4',
        relativePath: 'B/clip.mp4',
        size: 200,
        lastModified: 2000,
      },
    ];

    const tree = buildFolderTree('Root', rawVideos);
    const dfs = flattenTreeToDfsPlaylist(tree);
    expect(dfs.length).toBe(2);
    expect(dfs[0].id).toBe('A/clip.mp4');
    expect(dfs[1].id).toBe('B/clip.mp4');
    expect(dfs[0].size).not.toEqual(dfs[1].size);
  });
});
