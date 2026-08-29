import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";

import { CommitPane } from "./components/commits/CommitPane";
import { DiffPane } from "./components/diff/DiffPane";
import { EmptyProjects } from "./components/empty/EmptyProjects";
import { FilePane } from "./components/files/FilePane";
import { TitleBar } from "./components/layout/TitleBar";
import { SettingsModal } from "./components/projects/SettingsModal";
import { HResizer } from "./components/ui/HResizer";
import { Resizer } from "./components/ui/Resizer";
import { RingSpinner } from "./components/ui/RingSpinner";
import { Toasts } from "./components/ui/Toasts";
import { WorktreePane } from "./components/worktrees/WorktreePane";
import { useDashboard } from "./hooks/useDashboard";
import { useDiff } from "./hooks/useDiff";
import { useFileDiff } from "./hooks/useFileDiff";
import { usePaneResize } from "./hooks/usePaneResize";
import { useRevisions } from "./hooks/useRevisions";
import { useTheme } from "./hooks/useTheme";
import { useToast } from "./hooks/useToast";
import { buildSpec } from "./lib/revisions";
import {
  commitPaneHeightAtom,
  commitSelectionAtom,
  filesWidthAtom,
  revisionsAtom,
  selectedFileAtom,
  selectedWorktreeAtom,
  settingsOpenAtom,
  treeWidthAtom,
} from "./state/atoms";

/** コミット一覧とファイル一覧、それぞれが潰れない最小の高さ。 */
const MIN_COMMITS_H = 120;
const MIN_FILES_H = 140;

export default function App() {
  useTheme();
  useRevisions();

  const { projects, loading, reload, addProject, removeProject } =
    useDashboard();
  const { showError } = useToast();
  const { treeWidth, filesWidth, dragTree, dragFiles } = usePaneResize(
    treeWidthAtom,
    filesWidthAtom,
  );
  const [commitHeight, setCommitHeight] = useAtom(commitPaneHeightAtom);
  const [settingsOpen, setSettingsOpen] = useAtom(settingsOpenAtom);
  const revisions = useAtomValue(revisionsAtom);
  const selection = useAtomValue(commitSelectionAtom);
  const selectedWorktree = useAtomValue(selectedWorktreeAtom);
  const selectedFile = useAtomValue(selectedFileAtom);
  const [dragging, setDragging] = useState(false);

  const spec = buildSpec(
    selection,
    revisions?.commits ?? [],
    revisions?.defaultBase ?? null,
  );
  const { diff, loading: diffLoading } = useDiff(spec);
  // 一覧側の差分には色が付いていない。選択中のファイルだけを取り直し、
  // 構文ハイライトが届いたら差し替える。
  const listedFile =
    diff?.files.find((f) => f.path === selectedFile) ?? null;
  const shownFile = useFileDiff(spec, listedFile);

  const revealInWorktree = useCallback(
    (relativePath: string) => {
      if (!selectedWorktree) return;
      void revealItemInDir(`${selectedWorktree}/${relativePath}`).catch(
        showError,
      );
    },
    [selectedWorktree, showError],
  );

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

  const dragCommitBoundary = useCallback(
    (dy: number) => {
      setCommitHeight((h) => {
        const available = window.innerHeight - MIN_FILES_H;
        return Math.max(MIN_COMMITS_H, Math.min(h + dy, available));
      });
    },
    [setCommitHeight],
  );

  // ウィンドウ全体をドロップ先にする。
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
        <TitleBar
          projects={projects}
          commits={[]}
          defaultBase={null}
          onReload={reload}
        />
        <EmptyProjects onAddProject={handleAddProject} dragging={dragging} />
        <Toasts />
      </div>
    );
  }

  return (
    <div className="kd-shell" data-dragging={dragging || undefined}>
      <TitleBar
        projects={projects}
        commits={revisions?.commits ?? []}
        defaultBase={revisions?.defaultBase ?? null}
        onReload={reload}
      />

      <div className="kd-panes">
        <aside className="kd-pane kd-pane--tree" style={{ width: treeWidth }}>
          <WorktreePane onRevealWorktree={handleReveal} />
        </aside>
        <Resizer onDrag={dragTree} />

        <section className="kd-pane kd-pane--mid" style={{ width: filesWidth }}>
          <div
            className="kd-pane__top"
            style={{ height: commitHeight, flexBasis: commitHeight }}
          >
            <CommitPane />
          </div>
          <HResizer onDrag={dragCommitBoundary} />
          <div className="kd-pane__bottom">
            <FilePane
              diff={diff}
              loading={diffLoading}
              onRevealFile={revealInWorktree}
            />
          </div>
        </section>
        <Resizer onDrag={dragFiles} />

        <section className="kd-pane kd-pane--diff">
          <DiffPane
            file={shownFile}
            loading={diffLoading}
            onOpenFile={(path) => revealInWorktree(path)}
          />
        </section>
      </div>

      {settingsOpen ? (
        <SettingsModal
          projects={projects}
          onClose={() => setSettingsOpen(false)}
          onAddProject={handleAddProject}
          onRemoveProject={handleRemoveProject}
          onReveal={handleReveal}
        />
      ) : null}
      <Toasts />
    </div>
  );
}
