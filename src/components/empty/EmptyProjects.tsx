import { Button } from "../ui/Button";

interface EmptyProjectsProps {
  onAddProject: () => void;
  /** フォルダをウィンドウにドラッグしている最中か。 */
  dragging: boolean;
}

/**
 * 初回起動の画面。種から双葉が開くところまでを一度だけ描き、背後で木漏れ日が
 * 広がる。双葉はホバーで揺れる — 触ると反応する発見をここに 1 つだけ置く。
 */
export function EmptyProjects({ onAddProject, dragging }: EmptyProjectsProps) {
  return (
    <div className="kd-empty kd-empty--first" data-dragging={dragging || undefined}>
      <div className="kd-komorebi" aria-hidden />
      <Sprout />
      <h1 className="kd-empty__title">まだプロジェクトがありません</h1>
      <p className="kd-empty__text">
        git リポジトリのフォルダを追加すると、worktree の差分をここで読めます。
        <br />
        ウィンドウにフォルダをドロップしても登録できます。
      </p>
      <Button variant="primary" icon="create_new_folder" onClick={onAddProject}>
        フォルダを追加
        <kbd className="kd-kbd">⌘O</kbd>
      </Button>
    </div>
  );
}

function Sprout() {
  return (
    <svg
      className="kd-sprout"
      width="200"
      height="200"
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
