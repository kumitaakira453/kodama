import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

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

  // 少し動かしてから掴んだことにする。押しただけで並びが揺れると、
  // 名前や削除を押したつもりの操作が並べ替えになってしまう。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = projects.map((p) => p.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={projects.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="kd-projlist">
            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                editing={editing === project.id}
                onEdit={() => setEditing(project.id)}
                onDoneEdit={(name) => {
                  setEditing(null);
                  if (name && name !== project.name) {
                    onRenameProject(project.id, name);
                  }
                }}
                onRemove={() => onRemoveProject(project.id)}
                onReveal={() => onReveal(project.path)}
              />
            ))}
            {projects.length === 0 ? (
              <li className="kd-projlist__empty">まだ登録がありません</li>
            ) : null}
          </ul>
        </SortableContext>
      </DndContext>
    </Modal>
  );
}

function ProjectRow({
  project,
  editing,
  onEdit,
  onDoneEdit,
  onRemove,
  onReveal,
}: {
  project: Project;
  editing: boolean;
  onEdit: () => void;
  onDoneEdit: (name: string | null) => void;
  onRemove: () => void;
  onReveal: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });

  return (
    <li
      ref={setNodeRef}
      className="kd-projlist__item"
      data-held={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <span
        className="kd-projlist__handle"
        title="掴んで並べ替える"
        {...attributes}
        {...listeners}
      >
        <Icon name="drag_indicator" size={16} />
      </span>

      <div className="kd-projlist__text">
        {editing ? (
          <NameField name={project.name} onDone={onDoneEdit} />
        ) : (
          <button
            className="kd-projlist__name"
            title="名前を変える"
            onClick={onEdit}
          >
            {project.name}
          </button>
        )}
        <span className="kd-projlist__path">{project.path}</span>
      </div>

      <IconButton name="edit" label="名前を変える" size={16} onClick={onEdit} />
      <IconButton
        name="folder_open"
        label="Finder で表示"
        size={16}
        onClick={onReveal}
      />
      <IconButton
        name="delete"
        label="登録を解除"
        size={16}
        className="kd-iconbtn--danger"
        onClick={onRemove}
      />
    </li>
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
