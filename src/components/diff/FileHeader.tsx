import type { DiffFile, ViewedStatus } from "../../lib/types";
import { Icon } from "../ui/Icon";

interface FileHeaderProps {
  file: DiffFile;
  collapsed: boolean;
  viewed: ViewedStatus;
  onToggle: () => void;
  onToggleViewed: (path: string) => void;
  onReveal: (path: string) => void;
  /** 上端に固定して出しているヘッダか。影の有無だけが変わる。 */
  pinned?: boolean;
}

/** ファイルカードの見出し。折りたたみ・増減・操作をここに集める。 */
export function FileHeader({
  file,
  collapsed,
  viewed,
  onToggle,
  onToggleViewed,
  onReveal,
  pinned = false,
}: FileHeaderProps) {
  return (
    <div className="kd-fhead" data-pinned={pinned || undefined}>
      <button
        className="kd-fhead__toggle"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "展開する" : "折りたたむ"}
      >
        <Icon name={collapsed ? "chevron_right" : "expand_more"} size={16} />
      </button>

      <span className="kd-fhead__path" title={file.path}>
        {file.oldPath ? (
          <>
            <span className="kd-fhead__old">{file.oldPath}</span>
            <Icon name="arrow_right_alt" size={14} />
          </>
        ) : null}
        <PathLabel path={file.path} />
      </span>

      <span className="kd-fhead__stat">
        {file.additions > 0 ? (
          <span className="kd-add">+{file.additions}</span>
        ) : null}
        {file.deletions > 0 ? (
          <span className="kd-del">-{file.deletions}</span>
        ) : null}
        <ChangeBar additions={file.additions} deletions={file.deletions} />
      </span>

      {file.generated ? <span className="kd-chip">生成</span> : null}
      {viewed === "stale" ? (
        <span className="kd-fhead__stale" title="閲覧後に変わっています">
          変更あり
        </span>
      ) : null}

      <label className="kd-fhead__viewed" title="読み終えたら印を付ける (v)">
        <input
          type="checkbox"
          checked={viewed === "viewed"}
          onChange={() => onToggleViewed(file.path)}
        />
        閲覧済
      </label>

      <button
        className="kd-fhead__action"
        title="Finder で表示"
        aria-label="Finder で表示"
        onClick={() => onReveal(file.path)}
      >
        <Icon name="folder_open" size={15} />
      </button>
    </div>
  );
}

/** ディレクトリを控えめに、ファイル名を強く見せる。 */
function PathLabel({ path }: { path: string }) {
  const cut = path.lastIndexOf("/");
  if (cut < 0) return <span className="kd-fhead__name">{path}</span>;
  return (
    <>
      <span className="kd-fhead__dir">{path.slice(0, cut + 1)}</span>
      <span className="kd-fhead__name">{path.slice(cut + 1)}</span>
    </>
  );
}

/** 増減の比率を 5 個の四角で示す。GitHub と同じ見せ方。 */
function ChangeBar({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  const total = additions + deletions;
  if (total === 0) return null;
  const greens = Math.max(
    additions > 0 ? 1 : 0,
    Math.round((additions / total) * 5),
  );
  const reds = Math.max(deletions > 0 ? 1 : 0, 5 - greens);
  const blocks = Array.from({ length: 5 }, (_, i) =>
    i < greens ? "add" : i < greens + reds ? "del" : "none",
  );
  return (
    <span className="kd-bar" aria-hidden>
      {blocks.map((kind, i) => (
        <span key={i} className={`kd-bar__b kd-bar__b--${kind}`} />
      ))}
    </span>
  );
}
