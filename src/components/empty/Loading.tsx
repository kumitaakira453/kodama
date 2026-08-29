import { Sprout } from "./Sprout";

interface LoadingProps {
  /** いま何を待っているか。 */
  text: string;
  /** 補足。読み込み対象など。 */
  detail?: string;
}

/**
 * 読み込み中の画面。
 *
 * 小さな輪だけを置くと、面のほとんどが空白のまま止まって見える。初回起動と
 * 同じ若木を出して、待つあいだも育っているように見せる。
 */
export function Loading({ text, detail }: LoadingProps) {
  return (
    <div className="kd-empty kd-empty--loading" role="status" aria-live="polite">
      <div className="kd-komorebi" aria-hidden />
      <Sprout size={160} />
      <p className="kd-empty__text">{text}</p>
      {detail ? <small className="kd-empty__detail">{detail}</small> : null}
    </div>
  );
}
