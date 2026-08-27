import { useAtom } from "jotai";

import { IconButton } from "../ui/Button";
import { themeAtom, type Theme } from "../../state/atoms";

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
  onAddProject: () => void;
  onReload: () => void;
}

/**
 * ドラッグ領域はこのコンテナだけに付ける。`data-tauri-drag-region` を持つ要素の
 * 子はドラッグ対象から外れるので、ボタン側に打ち消しの指定は要らない。
 */
export function TitleBar({ onAddProject, onReload }: TitleBarProps) {
  const [theme, setTheme] = useAtom(themeAtom);

  return (
    <header className="kd-titlebar" data-tauri-drag-region>
      <div className="kd-titlebar__brand">
        <TrunkMark />
        <span className="kd-titlebar__name">kodama</span>
      </div>
      <div className="kd-titlebar__actions">
        <IconButton
          name="create_new_folder"
          label="プロジェクトを追加 (⌘O)"
          onClick={onAddProject}
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

/** 年輪を模したマーク。3 本の輪と、中心を通る幹の線。 */
function TrunkMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9.5"
        fill="none"
        stroke="var(--kd-accent)"
        strokeWidth="1.6"
        opacity="0.45"
      />
      <circle
        cx="12"
        cy="12"
        r="6"
        fill="none"
        stroke="var(--kd-accent)"
        strokeWidth="1.6"
        opacity="0.7"
      />
      <circle cx="12" cy="12" r="2.4" fill="var(--kd-accent)" />
    </svg>
  );
}
