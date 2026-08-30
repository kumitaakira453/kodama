import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

import {
  collapsedFilesAtom,
  currentFileAtom,
  fileOpenOverridesAtom,
  jumpRequestAtom,
  lineSelectionAtom,
  shortcutsOpenAtom,
  sidebarOpenAtom,
  viewModeAtom,
  visibleFilesAtom,
  wordDiffAtom,
} from "../state/atoms";

interface ShortcutHandlers {
  onAddProject: () => void;
  onReload: () => void;
  onToggleViewed: (path: string) => void;
  onFocusFilter: () => void;
}

/**
 * キーボード操作。表駆動で 1 か所にまとめ、アプリ全体で 1 回だけ張る。
 *
 * 入力中は修飾キー付き以外を無視する。コメントを書いている最中に `v` で
 * 閲覧済みが切り替わったら書けたものではない。
 */
export function useShortcuts({
  onAddProject,
  onReload,
  onToggleViewed,
  onFocusFilter,
}: ShortcutHandlers) {
  // 移動先は絞り込みに出ているものだけ。隠したファイルへ飛ぶと、画面には
  // 出ていないところで現在位置だけが動く。
  const files = useAtomValue(visibleFilesAtom);
  const current = useAtomValue(currentFileAtom);
  const setJump = useSetAtom(jumpRequestAtom);
  const setSelection = useSetAtom(lineSelectionAtom);
  const [mode, setMode] = useAtom(viewModeAtom);
  const [wordDiff, setWordDiff] = useAtom(wordDiffAtom);
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const collapsed = useAtomValue(collapsedFilesAtom);
  const setOverrides = useSetAtom(fileOpenOverridesAtom);
  const setShortcutsOpen = useSetAtom(shortcutsOpenAtom);

  useEffect(() => {
    const jumpBy = (step: number, onlyUnread: boolean) => {
      if (files.length === 0) return;
      const index = files.findIndex((f) => f.path === current);
      const from = index < 0 ? 0 : index;
      for (let i = 1; i <= files.length; i++) {
        const next = files[(from + step * i + files.length * i) % files.length];
        if (!next) continue;
        if (onlyUnread && collapsed.has(next.path)) continue;
        setJump({ path: next.path, nonce: Date.now() });
        return;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.metaKey) {
        if (e.key === "o") {
          e.preventDefault();
          onAddProject();
        } else if (e.key === "r") {
          e.preventDefault();
          onReload();
        } else if (e.key === "b") {
          e.preventDefault();
          setSidebarOpen(!sidebarOpen);
        } else if (e.key === "f") {
          e.preventDefault();
          setSidebarOpen(true);
          onFocusFilter();
        }
        return;
      }

      if (typing) {
        if (e.key === "Escape") setSelection(null);
        return;
      }

      switch (e.key) {
        case "n":
          e.preventDefault();
          jumpBy(1, false);
          break;
        case "p":
          e.preventDefault();
          jumpBy(-1, false);
          break;
        case "]":
          e.preventDefault();
          jumpBy(1, true);
          break;
        case "[":
          e.preventDefault();
          jumpBy(-1, true);
          break;
        case "v":
          if (current) {
            e.preventDefault();
            onToggleViewed(current);
          }
          break;
        case "u":
          e.preventDefault();
          setMode(mode === "split" ? "unified" : "split");
          break;
        case "w":
          e.preventDefault();
          setWordDiff(!wordDiff);
          break;
        case "c":
          if (current) {
            e.preventDefault();
            setOverrides((prev) => ({
              ...prev,
              [current]: collapsed.has(current),
            }));
          }
          break;
        case "?":
          e.preventDefault();
          setShortcutsOpen((v) => !v);
          break;
        case "Escape":
          setSelection(null);
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    files,
    current,
    collapsed,
    mode,
    wordDiff,
    sidebarOpen,
    setJump,
    setSelection,
    setMode,
    setWordDiff,
    setSidebarOpen,
    setOverrides,
    setShortcutsOpen,
    onAddProject,
    onReload,
    onToggleViewed,
    onFocusFilter,
  ]);
}
