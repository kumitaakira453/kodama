import type { Project } from "../../lib/types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";

interface SettingsModalProps {
  projects: Project[];
  onClose: () => void;
  onAddProject: () => void;
  onRemoveProject: (id: string) => void;
  onReveal: (path: string) => void;
}

export function SettingsModal({
  projects,
  onClose,
  onAddProject,
  onRemoveProject,
  onReveal,
}: SettingsModalProps) {
  return (
    <Modal title="プロジェクトを管理" onClose={onClose}>
      <ul className="kd-projlist">
        {projects.map((p) => (
          <li key={p.id} className="kd-projlist__item">
            <div className="kd-projlist__text">
              <span className="kd-projlist__name">{p.name}</span>
              <span className="kd-projlist__path">{p.path}</span>
            </div>
            <button
              className="kd-iconbtn"
              title="Finder で表示"
              aria-label="Finder で表示"
              onClick={() => onReveal(p.path)}
            >
              <Icon name="folder_open" size={16} />
            </button>
            <button
              className="kd-iconbtn kd-iconbtn--danger"
              title="登録を解除"
              aria-label="登録を解除"
              onClick={() => onRemoveProject(p.id)}
            >
              <Icon name="delete" size={16} />
            </button>
          </li>
        ))}
        {projects.length === 0 ? (
          <li className="kd-projlist__empty">まだ登録がありません</li>
        ) : null}
      </ul>

      <footer className="kd-modal__foot">
        <p className="kd-modal__note">
          登録を解除してもフォルダ自体は削除されません。
        </p>
        <Button variant="primary" icon="create_new_folder" onClick={onAddProject}>
          フォルダを追加
        </Button>
      </footer>
    </Modal>
  );
}
