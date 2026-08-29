import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";

import { DiffCanvas } from "./components/diff/DiffCanvas";
import { EmptyProjects } from "./components/empty/EmptyProjects";
import { SettingsModal } from "./components/projects/SettingsModal";
import { TopBar } from "./components/topbar/TopBar";
import { TreePane } from "./components/tree/TreePane";
import { Resizer } from "./components/ui/Resizer";
import { RingSpinner } from "./components/ui/RingSpinner";
import { Toasts } from "./components/ui/Toasts";
import { useDiff } from "./hooks/useDiff";
import { useProjects } from "./hooks/useProjects";
import { useRevisions } from "./hooks/useRevisions";
import { useApps } from "./hooks/useApps";
import { useThreads } from "./hooks/useThreads";
import { useViewed } from "./hooks/useViewed";
import { useShortcuts } from "./hooks/useShortcuts";
import { useWatch } from "./hooks/useWatch";
import { ShortcutsModal } from "./components/ui/ShortcutsModal";
import { useTheme } from "./hooks/useTheme";
import { useToast } from "./hooks/useToast";
import {
  jumpRequestAtom,
  selectedWorktreeAtom,
  focusFilterAtom,
  settingsOpenAtom,
  shortcutsOpenAtom,
  sidebarOpenAtom,
  sidebarWidthAtom,
} from "./state/atoms";

/** サイドバーの幅。狭すぎるとパスが読めず、広すぎると diff が窮屈になる。 */
const MIN_SIDEBAR = 220;
const MAX_SIDEBAR = 520;

export default function App() {
  useTheme();
  useRevisions();

  const { projects, loading, reload, addProject, removeProject } = useProjects();
  const { reload: reloadDiff } = useDiff();
  const { viewed, toggle: toggleViewed, progress } = useViewed();
  const { threads, refresh: refreshThreads, add, reply, resolve, drop } =
    useThreads();
  const { apps, open: openApp } = useApps();

  // 台帳は CLI（AI 側）から書き換わる。フォーカスが戻るのを待たずに反映する。
  useWatch({ onFiles: reloadDiff, onLedger: refreshThreads });
  const { showError } = useToast();

  const sidebarOpen = useAtomValue(sidebarOpenAtom);
  const [sidebarWidth, setSidebarWidth] = useAtom(sidebarWidthAtom);
  const [settingsOpen, setSettingsOpen] = useAtom(settingsOpenAtom);
  const [shortcutsOpen, setShortcutsOpen] = useAtom(shortcutsOpenAtom);
  const setFocusFilter = useSetAtom(focusFilterAtom);
  const worktree = useAtomValue(selectedWorktreeAtom);
  const setJump = useSetAtom(jumpRequestAtom);
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

  const revealAbsolute = useCallback(
    (path: string) => {
      void revealItemInDir(path).catch(showError);
    },
    [showError],
  );

  const dragSidebar = useCallback(
    (dx: number) =>
      setSidebarWidth((w) =>
        Math.max(MIN_SIDEBAR, Math.min(w + dx, MAX_SIDEBAR)),
      ),
    [setSidebarWidth],
  );

  const reloadAll = useCallback(() => {
    void reload();
    reloadDiff();
  }, [reload, reloadDiff]);

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

  useShortcuts({
    onAddProject: () => void handleAddProject(),
    onReload: reloadAll,
    onToggleViewed: toggleViewed,
    onFocusFilter: () => setFocusFilter((n) => n + 1),
  });

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
        <TopBar projects={projects} progress={progress} onReload={reloadAll} />
        <EmptyProjects onAddProject={handleAddProject} dragging={dragging} />
        <Toasts />
      </div>
    );
  }

  return (
    <div className="kd-shell" data-dragging={dragging || undefined}>
      <TopBar projects={projects} progress={progress} onReload={reloadAll} />

      <div className="kd-body">
        {sidebarOpen ? (
          <>
            <aside className="kd-sidebar" style={{ width: sidebarWidth }}>
              <TreePane
                onJump={(path) => setJump({ path, nonce: Date.now() })}
              />
            </aside>
            <Resizer onDrag={dragSidebar} />
          </>
        ) : null}

        <main className="kd-main">
          <DiffCanvas
            viewed={viewed}
            threads={threads}
            apps={apps}
            onToggleViewed={toggleViewed}
            onAddThread={(input) => void add(input)}
            onReply={(id, body) => void reply(id, body)}
            onResolve={(id) => void resolve(id)}
            onDropThread={(id) => void drop(id)}
            onOpenApp={(appId, path, line) =>
              worktree ? openApp(appId, `${worktree}/${path}`, line) : undefined
            }
          />
        </main>
      </div>

      {settingsOpen ? (
        <SettingsModal
          projects={projects}
          onClose={() => setSettingsOpen(false)}
          onAddProject={handleAddProject}
          onRemoveProject={handleRemoveProject}
          onReveal={revealAbsolute}
        />
      ) : null}
      {shortcutsOpen ? (
        <ShortcutsModal onClose={() => setShortcutsOpen(false)} />
      ) : null}
      <Toasts />
    </div>
  );
}
