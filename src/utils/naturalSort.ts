/**
 * Natural numeric-aware ascending string comparison.
 * Ensures "Episode 2" comes before "Episode 10".
 */
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

export function naturalSort<T>(items: T[], keySelector: (item: T) => string): T[] {
  return [...items].sort((a, b) => naturalCompare(keySelector(a), keySelector(b)));
}
