/**
 * 会話の本文に混じる、ごく狭い記法だけを解く。
 *
 * Markdown 全体は解釈しない。AI の返信に出てくるのは識別子と強調くらいで、
 * そこだけ組めれば読める。見出しや表まで解くと、会話が文書に見え始める。
 */
export type Segment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; text: string };

/**
 * 識別子が先、強調があと。
 *
 * 逆にすると `` `a ** b` `` の中の `**` まで強調として食われる。コードの中は
 * 書かれたままであるべきで、そこを崩すと意味が変わる。
 */
export function parseInline(text: string): Segment[] {
  const out: Segment[] = [];
  for (const part of splitByFence(text)) {
    if (part.kind === "code") {
      out.push(part);
      continue;
    }
    out.push(...splitByStrong(part.text));
  }
  return out.filter((s) => s.text !== "");
}

/** バッククォートで囲まれた部分を切り出す。閉じていなければ文字のまま。 */
function splitByFence(text: string): Segment[] {
  const parts = text.split("`");
  const out: Segment[] = [];
  for (let i = 0; i < parts.length; i++) {
    const body = parts[i] ?? "";
    const closed = i % 2 === 1 && i < parts.length - 1;
    if (closed) out.push({ kind: "code", text: body });
    else out.push({ kind: "text", text: i % 2 === 1 ? `\`${body}` : body });
  }
  return out;
}

/** `**` で囲まれた部分を切り出す。中身が空のものは強調にしない。 */
function splitByStrong(text: string): Segment[] {
  const out: Segment[] = [];
  let rest = text;
  while (true) {
    const open = rest.indexOf("**");
    if (open < 0) break;
    const close = rest.indexOf("**", open + 2);
    // 閉じていない、または `****` のように中身が無いものは記法として扱わない。
    if (close < 0 || close === open + 2) break;
    out.push({ kind: "text", text: rest.slice(0, open) });
    out.push({ kind: "strong", text: rest.slice(open + 2, close) });
    rest = rest.slice(close + 2);
  }
  out.push({ kind: "text", text: rest });
  return out;
}
