import { Fragment } from "react";

/**
 * 会話の本文。改行を保ち、バッククォートで囲んだ部分だけコードとして組む。
 *
 * Markdown 全体は解釈しない。AI の返信に識別子が出てくるので、そこが本文と
 * 地続きだと読み違える。閉じないバッククォートはそのまま文字として出す。
 */
export function CommentBody({ text }: { text: string }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((part, i) =>
        // 奇数番はバッククォートに挟まれた側。閉じていなければ最後の要素に
        // なるので、その場合は文字のまま出す。
        i % 2 === 1 && i < parts.length - 1 ? (
          <code key={i} className="kd-code-inline">
            {part}
          </code>
        ) : (
          <Fragment key={i}>{i % 2 === 1 ? `\`${part}` : part}</Fragment>
        ),
      )}
    </>
  );
}
