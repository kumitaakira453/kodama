import type { InlineRange, Token, TokenKind } from "../types";

/** 描画する断片。`cls` は文字色、`emph` は背景に効かせる。 */
export interface Segment {
  text: string;
  kind: TokenKind;
  emph: boolean;
}

/**
 * 構文トークンと行内差分範囲を重ね、両方の境界で切った断片列を返す。
 *
 * ここが「シンタックスハイライト × word-level diff」の合流点になる。HTML 文字列を
 * 経由すると、タグ境界と範囲境界が交差したときに正しくネストできない。両者を同じ
 * 座標系（UTF-16 コードユニット）の区間として扱い、`kind` は文字色・`emph` は背景と
 * 別の見た目に割り当てるので、ネストの交差そのものが起きない。
 *
 * 走査は 1 回で済み、計算量は O(トークン数 + 範囲数)。
 */
export function overlay(
  text: string,
  tokens: Token[] | null,
  ranges: InlineRange[] | null,
): Segment[] {
  const length = text.length;
  if (length === 0) return [];

  const spans = tokens?.length ? tokens : null;
  const marks = normalizeRanges(ranges, length);

  // 切れ目を集めてから 1 回で切る。トークンと範囲のどちらの境界も落とさない。
  const cuts = new Set<number>([0, length]);
  if (spans) {
    for (const t of spans) {
      cuts.add(clamp(t.start, length));
      cuts.add(clamp(t.start + t.len, length));
    }
  }
  for (const r of marks) {
    cuts.add(r.start);
    cuts.add(r.start + r.len);
  }

  const bounds = [...cuts].sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i];
    const end = bounds[i + 1];
    if (start >= end) continue;
    segments.push({
      text: text.slice(start, end),
      kind: spans ? kindAt(spans, start) : "plain",
      emph: coveredBy(marks, start),
    });
  }
  return mergeAdjacent(segments);
}

/** 範囲を昇順に並べ、重なりを潰し、行の長さでクリップする。 */
function normalizeRanges(
  ranges: InlineRange[] | null,
  length: number,
): InlineRange[] {
  if (!ranges?.length) return [];
  const sorted = ranges
    .map((r) => ({ start: clamp(r.start, length), len: r.len }))
    .map((r) => ({ start: r.start, end: clamp(r.start + r.len, length) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged.map((r) => ({ start: r.start, len: r.end - r.start }));
}

function kindAt(tokens: Token[], pos: number): TokenKind {
  // トークンは昇順で数も少ないため、線形に探す方が二分探索より速い。
  for (const t of tokens) {
    if (pos < t.start) break;
    if (pos < t.start + t.len) return t.kind;
  }
  return "plain";
}

function coveredBy(ranges: InlineRange[], pos: number): boolean {
  for (const r of ranges) {
    if (pos < r.start) return false;
    if (pos < r.start + r.len) return true;
  }
  return false;
}

function mergeAdjacent(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (last && last.kind === s.kind && last.emph === s.emph) {
      last.text += s.text;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}
