import { useAtom, useSetAtom } from "jotai";

import { describeSelection } from "../../lib/revisions";
import type { CommitInfo, Project } from "../../lib/types";
import {
  commitSelectionAtom,
  settingsOpenAtom,
  themeAtom,
  type Theme,
} from "../../state/atoms";
import { ProjectSwitcher } from "../projects/ProjectSwitcher";
import { IconButton } from "../ui/Button";

const NEXT_THEME: Record<Theme, Theme> = {
  system: "dark",
  dark: "light",
  light: "system",
};

const THEME_ICON: Record<Theme, string> = {
  system: "contrast",
  dark: "dark_mode",
  light: "light_mode",
};

const THEME_LABEL: Record<Theme, string> = {
  system: "テーマ: システムに追従",
  dark: "テーマ: ダーク",
  light: "テーマ: ライト",
};

interface TitleBarProps {
  projects: Project[];
  commits: CommitInfo[];
  defaultBase: string | null;
  onReload: () => void;
}

/**
 * ドラッグ領域はこのコンテナだけに付ける。`data-tauri-drag-region` を持つ要素の
 * 子はドラッグ対象から外れるので、ボタン側に打ち消しの指定は要らない。
 */
export function TitleBar({
  projects,
  commits,
  defaultBase,
  onReload,
}: TitleBarProps) {
  const [theme, setTheme] = useAtom(themeAtom);
  const [selection] = useAtom(commitSelectionAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);

  return (
    <header className="kd-titlebar" data-tauri-drag-region>
      <ProjectSwitcher projects={projects} />

      <span className="kd-titlebar__spec" title="いま表示している比較対象">
        {describeSelection(selection, commits, defaultBase)}
      </span>

      <div className="kd-titlebar__actions">
        <IconButton
          name="settings"
          label="プロジェクトを管理"
          onClick={() => setSettingsOpen(true)}
        />
        <IconButton name="refresh" label="再読込 (⌘R)" onClick={onReload} />
        <IconButton
          name={THEME_ICON[theme]}
          label={THEME_LABEL[theme]}
          onClick={() => setTheme(NEXT_THEME[theme])}
        />
      </div>
    </header>
  );
}
