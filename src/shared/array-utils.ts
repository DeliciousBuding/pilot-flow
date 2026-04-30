export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error("chunk size must be a positive integer");
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function firstBy<T>(items: readonly T[], predicate: (item: T) => boolean): T | undefined {
  return items.find(predicate);
}
