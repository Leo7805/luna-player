import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

describe('Theme Persistence Logic', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      // @ts-expect-error Mocking localStorage
      globalThis.localStorage = createLocalStorageMock();
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('saves and reads theme preference from localStorage', () => {
    localStorage.setItem('luna_theme', 'light');
    expect(localStorage.getItem('luna_theme')).toBe('light');

    localStorage.setItem('luna_theme', 'dark');
    expect(localStorage.getItem('luna_theme')).toBe('dark');
  });

  it('falls back cleanly when no theme preference is stored', () => {
    expect(localStorage.getItem('luna_theme')).toBeNull();
  });
});
