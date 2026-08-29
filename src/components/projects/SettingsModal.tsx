import { useRef, useState } from "react";

import type { Project } from "../../lib/types";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";

interface SettingsModalProps {
  projects: Project[];
  onClose: () => void;
  onAddProject: () => void;
  onRemoveProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onReorderProjects: (ids: string[]) => void;
  onReveal: (path: string) => void;
}

export function SettingsModal({
  projects,
  onClose,
  onAddProject,
  onRemoveProject,
  onRenameProject,
  onReorderProjects,
  onReveal,
}: SettingsModalProps) {
  /** 名前を書き換え中のプロジェクト。 */
  const [editing, setEditing] = useState<string | null>(null);

  /**
   * 掴んでいるあいだの並び。離すまで保存しない。
   *
   * HTML5 の drag & drop ではなくポインタで作る。webview では OS 側の
   * ドラッグ処理と取り合いになり、環境によって drop が届かない。
   */
  const [order, setOrder] = useState<string[] | null>(null);
  const [holding, setHolding] = useState<string | null>(null);
  const grab = useRef<{ from: number; startY: number; rowH: number } | null>(
    null,
  );

  const shown = order
    ? order.flatMap((id) => projects.find((p) => p.id === id) ?? [])
    : projects;

  const onGrab = (e: React.PointerEvent, id: string, index: number) => {
    const row = (e.currentTarget as HTMLElement).closest("li");
    if (!row) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    grab.current = {
      from: index,
      startY: e.clientY,
      rowH: row.getBoundingClientRect().height,
    };
    setOrder(projects.map((p) => p.id));
    setHolding(id);
  };

  const onDragMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || g.rowH <= 0) return;
    // 行の高さは一定なので、動いた距離を段数に直せば移動先が決まる。
    const steps = Math.round((e.clientY - g.startY) / g.rowH);
    const to = Math.max(0, Math.min(projects.length - 1, g.from + steps));
    const ids = projects.map((p) => p.id);
    ids.splice(to, 0, ...ids.splice(g.from, 1));
    setOrder(ids);
  };

  const onRelease = () => {
    if (!grab.current) return;
    grab.current = null;
    setHolding(null);
    const next = order;
    setOrder(null);
    if (!next) return;
    const before = projects.map((p) => p.id).join("\n");
    if (next.join("\n") !== before) onReorderProjects(next);
  };

  return (
    <Modal
      title="プロジェクトを管理"
      onClose={onClose}
      footer={
        <>
          <p className="kd-modal__note">
            登録を解除してもフォルダ自体は削除されません。
          </p>
          <Button
            variant="primary"
            icon="create_new_folder"
            onClick={onAddProject}
          >
            フォルダを追加
          </Button>
        </>
      }
    >
      <ul className="kd-projlist" data-dragging={holding ? "" : undefined}>
        {shown.map((project, index) => (
          <li
            key={project.id}
            className="kd-projlist__item"
            data-held={project.id === holding || undefined}
          >
            <span
              className="kd-projlist__handle"
              title="掴んで並べ替える"
              aria-label="掴んで並べ替える"
              onPointerDown={(e) => onGrab(e, project.id, index)}
              onPointerMove={onDragMove}
              onPointerUp={onRelease}
              onPointerCancel={onRelease}
            >
              <Icon name="drag_indicator" size={16} />
            </span>

            <div className="kd-projlist__text">
              {editing === project.id ? (
                <NameField
                  name={project.name}
                  onDone={(name) => {
                    setEditing(null);
                    if (name && name !== project.name) {
                      onRenameProject(project.id, name);
                    }
                  }}
                />
              ) : (
                <button
                  className="kd-projlist__name"
                  title="名前を変える"
                  onClick={() => setEditing(project.id)}
                >
                  {project.name}
                </button>
              )}
              <span className="kd-projlist__path">{project.path}</span>
            </div>

            <IconButton
              name="edit"
              label="名前を変える"
              size={16}
              onClick={() => setEditing(project.id)}
            />
            <IconButton
              name="folder_open"
              label="Finder で表示"
              size={16}
              onClick={() => onReveal(project.path)}
            />
            <IconButton
              name="delete"
              label="登録を解除"
              size={16}
              className="kd-iconbtn--danger"
              onClick={() => onRemoveProject(project.id)}
            />
          </li>
        ))}
        {projects.length === 0 ? (
          <li className="kd-projlist__empty">まだ登録がありません</li>
        ) : null}
      </ul>
    </Modal>
  );
}

/**
 * 名前の入力欄。Enter で確定、Esc で取消。
 *
 * 入力中の文字はここで持つ。上位に置くと 1 文字ごとに一覧が描き直される。
 */
function NameField({
  name,
  onDone,
}: {
  name: string;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(name);

  return (
    <input
      className="kd-projlist__input"
      value={value}
      autoFocus
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onDone(value.trim() || null);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onDone(null);
        }
      }}
    />
  );
}
