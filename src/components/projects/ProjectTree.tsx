import { useAtom, useAtomValue } from "jotai";
import { useCallback } from "react";

import type { Project } from "../../lib/types";
import {
  collapsedProjectsAtom,
  selectedProjectIdAtom,
  selectedWorktreeAtom,
  worktreesAtom,
} from "../../state/atoms";
import { Icon } from "../ui/Icon";
import { WorktreeRow } from "./WorktreeRow";

interface ProjectTreeProps {
  projects: Project[];
  onRemoveProject: (id: string) => void;
  onRevealProject: (path: string) => void;
}

export function ProjectTree({
  projects,
  onRemoveProject,
  onRevealProject,
}: ProjectTreeProps) {
  const worktrees = useAtomValue(worktreesAtom);
  const [collapsed, setCollapsed] = useAtom(collapsedProjectsAtom);
  const [selectedProjectId, setSelectedProjectId] = useAtom(
    selectedProjectIdAtom,
  );
  const [selectedWorktree, setSelectedWorktree] = useAtom(selectedWorktreeAtom);

  const toggle = useCallback(
    (id: string) =>
      setCollapsed((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      ),
    [setCollapsed],
  );

  return (
    <nav className="kd-tree">
      {projects.map((project) => {
        const list = worktrees[project.id] ?? [];
        const isCollapsed = collapsed.includes(project.id);
        return (
          <section key={project.id} className="kd-tree__project">
            <div className="kd-tree__head">
              <button
                className="kd-tree__toggle"
                onClick={() => toggle(project.id)}
                aria-expanded={!isCollapsed}
              >
                <Icon
                  name={isCollapsed ? "chevron_right" : "expand_more"}
                  size={16}
                />
                <span className="kd-tree__name">{project.name}</span>
                <span className="kd-tree__count">{list.length}</span>
              </button>
              <button
                className="kd-tree__action"
                title="Finder で表示"
                aria-label="Finder で表示"
                onClick={() => onRevealProject(project.path)}
              >
                <Icon name="folder_open" size={14} />
              </button>
              <button
                className="kd-tree__action"
                title="登録を解除"
                aria-label="登録を解除"
                onClick={() => onRemoveProject(project.id)}
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            {/* grid-template-rows の 0fr → 1fr で高さ auto を素直に畳む。 */}
            <div className="kd-tree__body" data-open={!isCollapsed || undefined}>
              <div className="kd-tree__clip">
                {list.map((w) => (
                  <WorktreeRow
                    key={w.path}
                    worktree={w}
                    selected={
                      selectedProjectId === project.id &&
                      selectedWorktree === w.path
                    }
                    onSelect={() => {
                      setSelectedProjectId(project.id);
                      setSelectedWorktree(w.path);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onRevealProject(w.path);
                    }}
                  />
                ))}
                {list.length === 0 ? (
                  <p className="kd-tree__empty">worktree がありません</p>
                ) : null}
              </div>
            </div>
          </section>
        );
      })}
    </nav>
  );
}
