import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";

import { EmptyProjects } from "./components/empty/EmptyProjects";
import { TitleBar } from "./components/layout/TitleBar";
import { ProjectTree } from "./components/projects/ProjectTree";
import { Resizer } from "./components/ui/Resizer";
import { RingSpinner } from "./components/ui/RingSpinner";
import { Toasts } from "./components/ui/Toasts";
import { useDashboard } from "./hooks/useDashboard";
import { usePaneResize } from "./hooks/usePaneResize";
import { useTheme } from "./hooks/useTheme";
import { useToast } from "./hooks/useToast";
import {
  filesWidthAtom,
  selectedWorktreeAtom,
  treeWidthAtom,
} from "./state/atoms";

export default function App() {
  useTheme();
  const { projects, loading, reload, addProject, removeProject } =
    useDashboard();
  const { showError } = useToast();
  const { treeWidth, filesWidth, dragTree, dragFiles } = usePaneResize(
    treeWidthAtom,
    filesWidthAtom,
  );
  const selectedWorktree = useAtomValue(selectedWorktreeAtom);
  const [dragging, setDragging] = useState(false);

  const handleAddProject = useCallback(async () => {
    try {
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked !== "string") return;
      await addProject(picked);
    } catch (e) {
      showError(e);
    }
  }, [addProject, showError]);

  const handleRemoveProject = useCallback(
    async (id: string) => {
      try {
        await removeProject(id);
      } catch (e) {
        showError(e);
      }
    },
    [removeProject, showError],
  );

  const handleReveal = useCallback(
    (path: string) => {
      void revealItemInDir(path).catch(showError);
    },
    [showError],
  );

  // ウィンドウ全体をドロップ先にする。初回起動の画面では枠が光って受け口を示す。
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        setDragging(true);
        return;
      }
      if (event.payload.type === "leave") {
        setDragging(false);
        return;
      }
      setDragging(false);
      for (const path of event.payload.paths) {
        void addProject(path).catch(showError);
      }
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [addProject, showError]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === "o") {
        e.preventDefault();
        void handleAddProject();
      } else if (e.key === "r") {
        e.preventDefault();
        void reload();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleAddProject, reload]);

  if (loading && projects.length === 0) {
    return (
      <div className="kd-boot">
        <RingSpinner size={32} />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="kd-shell">
        <TitleBar onAddProject={handleAddProject} onReload={reload} />
        <EmptyProjects onAddProject={handleAddProject} dragging={dragging} />
        <Toasts />
      </div>
    );
  }

  return (
    <div className="kd-shell" data-dragging={dragging || undefined}>
      <TitleBar onAddProject={handleAddProject} onReload={reload} />
      <div className="kd-panes">
        <aside className="kd-pane kd-pane--tree" style={{ width: treeWidth }}>
          <ProjectTree
            projects={projects}
            onRemoveProject={handleRemoveProject}
            onRevealProject={handleReveal}
          />
        </aside>
        <Resizer onDrag={dragTree} />

        <section className="kd-pane kd-pane--files" style={{ width: filesWidth }}>
          <div className="kd-placeholder">
            <p>変更ファイル</p>
            <small>{selectedWorktree ?? "worktree を選んでください"}</small>
          </div>
        </section>
        <Resizer onDrag={dragFiles} />

        <section className="kd-pane kd-pane--diff">
          <div className="kd-placeholder">
            <p>差分</p>
            <small>ファイルを選ぶとここに表示されます</small>
          </div>
        </section>
      </div>
      <Toasts />
    </div>
  );
}
