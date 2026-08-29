import { useAtom, useAtomValue, useSetAtom } from "jotai";

import type { Project } from "../../lib/types";
import {
  diffAtom,
  selectedProjectIdAtom,
  selectedWorktreeAtom,
  settingsOpenAtom,
  sidebarOpenAtom,
  themeAtom,
  type Theme,
} from "../../state/atoms";
import { IconButton } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Icon } from "../ui/Icon";
import { RevisionMenu } from "./RevisionMenu";
import { WorktreeMenu } from "./WorktreeMenu";

const NEXT_THEME: Record<Theme, Theme> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const THEME_ICON: Record<Theme, string> = {
  light: "light_mode",
  dark: "dark_mode",
  system: "contrast",
};

const THEME_LABEL: Record<Theme, string> = {
  light: "テーマ: ライト",
  dark: "テーマ: ダーク",
  system: "テーマ: システムに追従",
};

interface TopBarProps {
  projects: Project[];
  onReload: () => void;
}

/**
 * ドラッグ領域はこのコンテナだけに付ける。`data-tauri-drag-region` を持つ要素の
 * 子はドラッグ対象から外れるので、ボタン側に打ち消しの指定は要らない。
 */
export function TopBar({ projects, onReload }: TopBarProps) {
  const [theme, setTheme] = useAtom(themeAtom);
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const [projectId, setProjectId] = useAtom(selectedProjectIdAtom);
  const setWorktree = useSetAtom(selectedWorktreeAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const diff = useAtomValue(diffAtom);

  const project = projects.find((p) => p.id === projectId) ?? projects[0];

  return (
    <header className="kd-topbar" data-tauri-drag-region>
      <IconButton
        name={sidebarOpen ? "left_panel_close" : "left_panel_open"}
        label="サイドバーの開閉 (⌘B)"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      />

      <Dropdown icon="folder" label={project?.name ?? "プロジェクト"} width={320}>
        {(close) => (
          <>
            {projects.map((p) => (
              <button
                key={p.id}
                className="kd-menuitem"
                data-selected={p.id === project?.id || undefined}
                title={p.path}
                onClick={() => {
                  setProjectId(p.id);
                  setWorktree(null);
                  close();
                }}
              >
                <Icon
                  name={
                    p.id === project?.id
                      ? "radio_button_checked"
                      : "radio_button_unchecked"
                  }
                  size={15}
                />
                <span className="kd-menuitem__text">{p.name}</span>
              </button>
            ))}
            <div className="kd-menu__sep" />
            <button
              className="kd-menuitem"
              onClick={() => {
                setSettingsOpen(true);
                close();
              }}
            >
              <Icon name="settings" size={15} />
              <span className="kd-menuitem__text">プロジェクトを管理…</span>
            </button>
          </>
        )}
      </Dropdown>

      <WorktreeMenu />

      <RevisionMenu />

      <div className="kd-topbar__spacer" />

      {diff ? (
        <span className="kd-topbar__stat">
          {diff.files.length} ファイル
          <span className="kd-add">
            +{diff.files.reduce((n, f) => n + f.additions, 0)}
          </span>
          <span className="kd-del">
            -{diff.files.reduce((n, f) => n + f.deletions, 0)}
          </span>
        </span>
      ) : null}

      <IconButton name="refresh" label="再読込 (⌘R)" onClick={onReload} />
      <IconButton
        name={THEME_ICON[theme]}
        label={THEME_LABEL[theme]}
        onClick={() => setTheme(NEXT_THEME[theme])}
      />
    </header>
  );
}
