import { describe, it, expect } from 'vitest';
import { naturalCompare, naturalSort } from '../src/utils/naturalSort';

describe('naturalSort', () => {
  it('correctly handles numeric ascending ordering', () => {
    const list = [
      'Episode 10',
      'Episode 2',
      'Episode 1',
      'Episode 20',
      'Episode 3',
    ];

    const sorted = naturalSort(list, (x) => x);
    expect(sorted).toEqual([
      'Episode 1',
      'Episode 2',
      'Episode 3',
      'Episode 10',
      'Episode 20',
    ]);
  });

  it('handles strings with numbers and letters', () => {
    const filenames = ['video_1b.mp4', 'video_1a.mp4', 'video_10.mp4', 'video_2.mp4'];
    const sorted = filenames.sort(naturalCompare);
    expect(sorted).toEqual(['video_1a.mp4', 'video_1b.mp4', 'video_2.mp4', 'video_10.mp4']);
  });

  it('handles identical strings', () => {
    expect(naturalCompare('sample.mp4', 'sample.mp4')).toBe(0);
  });
});
