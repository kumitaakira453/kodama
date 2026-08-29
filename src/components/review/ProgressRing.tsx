import type { ReviewProgress } from "../../hooks/useViewed";

const R = 9;
const C = 2 * Math.PI * R;

/**
 * レビューの進み具合を年輪で示す。
 *
 * 閲覧済みを緑、変わったものを金、未読を境界色で塗る。3 色を 1 本の弧に混ぜる
 * ため、円を 1 本ではなく 3 本重ねて弧長を制御する。
 */
export function ProgressRing({ progress }: { progress: ReviewProgress }) {
  const { total, viewed, stale, done } = progress;
  if (total === 0) return null;

  const viewedLen = (viewed / total) * C;
  const staleLen = (stale / total) * C;

  return (
    <span className="kd-progress" title={`${viewed} / ${total} 閲覧済み`}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <circle
          cx="11"
          cy="11"
          r={R}
          fill="none"
          stroke="var(--kd-border-strong)"
          strokeWidth="2.5"
        />
        {stale > 0 ? (
          <circle
            cx="11"
            cy="11"
            r={R}
            fill="none"
            stroke="var(--kd-accent-2)"
            strokeWidth="2.5"
            strokeDasharray={`${staleLen} ${C}`}
            strokeDashoffset={-viewedLen}
            transform="rotate(-90 11 11)"
            strokeLinecap="butt"
          />
        ) : null}
        <circle
          className="kd-progress__done"
          cx="11"
          cy="11"
          r={R}
          fill="none"
          stroke="var(--kd-accent)"
          strokeWidth={done ? 3 : 2.5}
          strokeDasharray={`${viewedLen} ${C}`}
          transform="rotate(-90 11 11)"
          strokeLinecap="butt"
        />
      </svg>
      <span className="kd-progress__text">
        {done ? "読み切りました" : `${viewed}/${total}`}
        {stale > 0 ? (
          <span className="kd-progress__stale">変更 {stale}</span>
        ) : null}
      </span>
    </span>
  );
}
