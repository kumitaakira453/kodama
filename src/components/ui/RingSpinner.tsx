/**
 * 年輪が内から外へ広がるローダー。3 本の円を 0.2s ずつずらして描く。
 */
export function RingSpinner({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="kd-spinner"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="status"
      aria-label="読み込み中"
    >
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke="var(--kd-accent)"
          strokeWidth="2"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </svg>
  );
}
