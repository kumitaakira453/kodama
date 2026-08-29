import type { AppTarget, DiffFile, ViewedStatus } from "../../lib/types";
import { Dropdown } from "../ui/Dropdown";
import { Icon } from "../ui/Icon";

interface FileHeaderProps {
  file: DiffFile;
  collapsed: boolean;
  viewed: ViewedStatus;
  onToggle: () => void;
  onToggleViewed: (path: string) => void;
  apps: AppTarget[];
  onOpen: (appId: string, path: string, line: number | null) => void;
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
  apps,
  onOpen,
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
            <span className="kd-fhead__arrow">
              <Icon name="arrow_right_alt" size={14} />
            </span>
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

      <span className="kd-fhead__spring" />

      <label className="kd-fhead__viewed" title="読み終えたら印を付ける (v)">
        <input
          type="checkbox"
          checked={viewed === "viewed"}
          onChange={() => onToggleViewed(file.path)}
        />
        閲覧済
      </label>

      <Dropdown icon="open_in_new" label="開く" width={220} title="このファイルを開く">
        {(close) =>
          apps.map((app) => (
            <button
              key={app.id}
              className="kd-menuitem"
              onClick={() => {
                onOpen(app.id, file.path, file.hunks[0]?.newStart ?? null);
                close();
              }}
            >
              <span className="kd-menuitem__text">{app.label}</span>
              {app.supportsLine ? (
                <span className="kd-menuitem__hint">行を指定</span>
              ) : null}
            </button>
          ))
        }
      </Dropdown>
    </div>
  );
}

/** ディレクトリを控えめに、ファイル名を強く見せる。 */
function PathLabel({ path }: { path: string }) {
  const cut = path.lastIndexOf("/");
  if (cut < 0) return <span className="kd-fhead__name">{path}</span>;
  return (
    <>
      {/* 区切りの "/" をディレクトリの外に出す。中に含めると、左を省略するための
          direction: rtl で行末の中立文字として扱われ、先頭へ回り込む。 */}
      <span className="kd-fhead__dir">{path.slice(0, cut)}</span>
      <span className="kd-fhead__slash">/</span>
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
