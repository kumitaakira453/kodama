/**
 * 発言者の見分け。
 *
 * 台帳の `author` は自由な文字列で、GUI は `you`、CLI は既定で `AI` を入れる。
 * 誰の発言かは会話を読むうえでいちばん先に要る情報なので、名前をそのまま
 * 出すのではなく、見分けの付く形に翻訳する。
 */
export type AuthorKind = "you" | "ai" | "other";

export interface AuthorFace {
  kind: AuthorKind;
  label: string;
  icon: string;
}

export function faceOf(author: string): AuthorFace {
  const name = author.trim();
  if (name.toLowerCase() === "you") {
    return { kind: "you", label: "あなた", icon: "person" };
  }
  if (name.toLowerCase() === "ai") {
    return { kind: "ai", label: "AI", icon: "smart_toy" };
  }
  return { kind: "other", label: name || "不明", icon: "person" };
}
