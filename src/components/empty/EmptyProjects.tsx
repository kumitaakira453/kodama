import { Button } from "../ui/Button";
import { Sprout } from "./Sprout";

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
