import { useState } from "react";

import type { Project } from "../../lib/types";
import { Button, IconButton } from "../ui/Button";
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

  /** その行を 1 つ動かす。順序は id の並びとして丸ごと渡す。 */
  const move = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= projects.length) return;
    const ids = projects.map((p) => p.id);
    [ids[index], ids[to]] = [ids[to], ids[index]];
    onReorderProjects(ids);
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
      <ul className="kd-projlist">
        {projects.map((project, index) => (
          <li key={project.id} className="kd-projlist__item">
            <span className="kd-projlist__move">
              <IconButton
                name="keyboard_arrow_up"
                label="上へ"
                size={16}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              />
              <IconButton
                name="keyboard_arrow_down"
                label="下へ"
                size={16}
                disabled={index === projects.length - 1}
                onClick={() => move(index, 1)}
              />
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
