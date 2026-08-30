import { useSetAtom } from "jotai";
import { useMemo, useState } from "react";

import { faceOf } from "../../lib/author";
import { relativeTime } from "../../lib/time";
import type { ThreadView } from "../../lib/types";
import { jumpRequestAtom } from "../../state/atoms";
import { Icon } from "../ui/Icon";
import { CommentBody } from "./CommentBody";

/** ファイルごとにまとめた指摘。並びは差分と同じにする。 */
interface Group {
  file: string;
  views: ThreadView[];
}

function groupByFile(views: ThreadView[]): Group[] {
  const groups: Group[] = [];
  for (const view of views) {
    const last = groups[groups.length - 1];
    if (last && last.file === view.thread.file) last.views.push(view);
    else groups.push({ file: view.thread.file, views: [view] });
  }
  return groups;
}

/** 末尾のファイル名だけを強く、上の階層は薄く出す。 */
function splitPath(path: string): [string, string] {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? ["", path] : [path.slice(0, cut + 1), path.slice(cut + 1)];
}

/**
 * この worktree に付いた指摘の一覧。
 *
 * 差分の中の指摘は、そのファイルを開いて該当行まで辿らないと見えない。
 * 何が残っているかを一度に見渡せる場所を別に持ち、そこから対象へ飛ばす。
 */
export function CommentsDrawer({
  threads,
  onClose,
}: {
  threads: ThreadView[];
  onClose: () => void;
}) {
  const setJump = useSetAtom(jumpRequestAtom);
  const [showResolved, setShowResolved] = useState(false);

  const open = useMemo(
    () => threads.filter((v) => v.thread.status.kind === "open"),
    [threads],
  );
  const shown = showResolved ? threads : open;
  const groups = useMemo(() => groupByFile(shown), [shown]);

  return (
    <aside className="kd-drawer" aria-label="指摘の一覧">
      <header className="kd-drawer__head">
        <Icon name="forum" size={16} />
        <h2 className="kd-drawer__title">指摘</h2>
        <span className="kd-drawer__count">{open.length}</span>
        <span className="kd-drawer__spacer" />
        {/* どちらを見ているかを常に出す。片方だけの押しボタンだと、
            いま何が省かれているのか分からない。 */}
        <div className="kd-seg kd-seg--sm" role="group" aria-label="出す範囲">
          <button
            className="kd-seg__item"
            aria-pressed={!showResolved}
            onClick={() => setShowResolved(false)}
          >
            未解決
          </button>
          <button
            className="kd-seg__item"
            aria-pressed={showResolved}
            onClick={() => setShowResolved(true)}
          >
            すべて
          </button>
        </div>
        <button className="kd-iconbtn" onClick={onClose} aria-label="閉じる">
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="kd-drawer__body">
        {groups.length === 0 ? (
          <p className="kd-drawer__empty">
            {showResolved ? "指摘はまだありません" : "未解決の指摘はありません"}
          </p>
        ) : (
          groups.map((group) => {
            const [dir, name] = splitPath(group.file);
            return (
              <section key={group.file} className="kd-drawer__group">
                <h3 className="kd-drawer__file" title={group.file}>
                  <span className="kd-drawer__dir">{dir}</span>
                  <span className="kd-drawer__name">{name}</span>
                </h3>
                {group.views.map((view) => (
                  <ThreadEntry
                    key={view.thread.id}
                    view={view}
                    onJump={() =>
                      setJump({
                        path: view.thread.file,
                        thread: view.thread.id,
                        nonce: Date.now(),
                      })
                    }
                  />
                ))}
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
}

function ThreadEntry({
  view,
  onJump,
}: {
  view: ThreadView;
  onJump: () => void;
}) {
  const first = view.thread.comments[0];
  const replies = view.thread.comments.length - 1;
  const resolved = view.thread.status.kind !== "open";
  // 会話の顔ぶれ。誰が絡んでいるかは、中身より先に目に入る。
  const faces = [...new Set(view.thread.comments.map((c) => c.author))].map(
    faceOf,
  );

  return (
    <button
      className="kd-entry"
      data-resolved={resolved || undefined}
      onClick={onJump}
      title="この指摘の場所へ飛ぶ"
    >
      <div className="kd-entry__head">
        <span className="kd-entry__faces">
          {faces.map((f) => (
            <span
              key={f.kind + f.label}
              className="kd-face kd-face--sm"
              data-who={f.kind}
            >
              {f.initial}
            </span>
          ))}
        </span>
        <span className="kd-entry__line">
          {view.thread.lineStart === view.thread.lineEnd
            ? `${view.thread.lineStart} 行目`
            : `${view.thread.lineStart}–${view.thread.lineEnd} 行目`}
        </span>
        <span className="kd-drawer__spacer" />
        {resolved ? (
          <span className="kd-entry__badge">解決済み</span>
        ) : null}
        <span className="kd-entry__time">
          {relativeTime(view.thread.createdAt)}
        </span>
      </div>

      {first ? (
        <p className="kd-entry__excerpt">
          <CommentBody text={first.body} />
        </p>
      ) : null}

      <div className="kd-entry__foot">
        {view.thread.context ? (
          <span className="kd-entry__context">{view.thread.context}</span>
        ) : null}
        {replies > 0 ? (
          <span className="kd-entry__replies">
            <Icon name="reply" size={12} />
            {replies}
          </span>
        ) : null}
      </div>
    </button>
  );
}
