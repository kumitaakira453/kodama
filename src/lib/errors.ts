/**
 * Rust から返るエラーは `{ message: string }`。invoke の reject は `unknown` なので、
 * 型ガードで絞り込んでから読む。`as` によるキャストはしない。
 */

function hasMessage(value: unknown): value is { message: string } {
  if (typeof value !== "object" || value === null || !("message" in value)) {
    return false;
  }
  // `in` による絞り込みで message へ直接触れるので、キャストは要らない。
  return typeof value.message === "string";
}

export function errorMessage(e: unknown): string {
  if (hasMessage(e)) return e.message;
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "予期しないエラーが発生しました。";
}
