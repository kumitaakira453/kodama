/**
 * 種から双葉が開くところまでを描く。
 *
 * 初回起動と読み込み中で同じ絵を使う。待っているあいだも「育っている」に
 * 見えるので、輪が回るだけの表示より場がもつ。
 */
export function Sprout({ size = 200 }: { size?: number }) {
  return (
    <svg
      className="kd-sprout"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden
    >
      {/* 種 */}
      <ellipse
        className="kd-sprout__seed"
        cx="60"
        cy="96"
        rx="9"
        ry="6"
        fill="var(--kd-muted)"
        opacity="0.5"
      />
      {/* 茎 */}
      <path
        className="kd-sprout__stem"
        d="M60 96 L60 58"
        fill="none"
        stroke="var(--kd-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* 双葉。輪郭を描いてから塗りを乗せる。 */}
      <g className="kd-leaf kd-leaf--left">
        <path
          className="kd-sprout__outline"
          d="M60 64 C42 64 32 54 30 42 C46 40 58 48 60 64 Z"
          fill="none"
          stroke="var(--kd-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          className="kd-sprout__fill"
          d="M60 64 C42 64 32 54 30 42 C46 40 58 48 60 64 Z"
          fill="var(--kd-accent)"
          opacity="0.22"
        />
      </g>
      <g className="kd-leaf kd-leaf--right">
        <path
          className="kd-sprout__outline"
          d="M60 60 C78 60 88 48 90 34 C72 32 60 42 60 60 Z"
          fill="none"
          stroke="var(--kd-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          className="kd-sprout__fill"
          d="M60 60 C78 60 88 48 90 34 C72 32 60 42 60 60 Z"
          fill="var(--kd-accent)"
          opacity="0.22"
        />
      </g>
    </svg>
  );
}
