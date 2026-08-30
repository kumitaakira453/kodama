import { getVersion } from "@tauri-apps/api/app";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";

import type { Project } from "../../lib/types";
import {
  diffAtom,
  selectedProjectIdAtom,
  selectedWorktreeAtom,
  appearanceOpenAtom,
  settingsOpenAtom,
  shortcutsOpenAtom,
  sidebarOpenAtom,
  themeAtom,
  viewModeAtom,
  type Theme,
} from "../../state/atoms";
import {
  updateCheckNonceAtom,
  updateStatusAtom,
  type UpdateStatus,
} from "../../state/updater";
import { IconButton } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Icon } from "../ui/Icon";
import type { ReviewProgress } from "../../hooks/useViewed";
import { ProgressRing } from "../review/ProgressRing";
import { RevisionMenu } from "./RevisionMenu";
import { WorktreeMenu } from "./WorktreeMenu";

const NEXT_THEME: Record<Theme, Theme> = { light: "dark", dark: "light" };

const THEME_ICON: Record<Theme, string> = {
  light: "light_mode",
  dark: "dark_mode",
};

const THEME_LABEL: Record<Theme, string> = {
  light: "テーマ: ライト",
  dark: "テーマ: ダーク",
};

/** 「更新を確認」の見え方。押した結果をその場に出す。 */
const UPDATE_HINT: Record<UpdateStatus, string> = {
  idle: "",
  checking: "確認中…",
  available: "更新あり",
  uptodate: "最新です",
  error: "確認できません",
};

/**
 * アプリ自体の操作をまとめたメニュー。
 *
 * 更新の確認をプロジェクトの一覧の中に入れると、プロジェクトを選ぶ場所だと
 * 思って開かないので見つからない。アプリに属する操作はここに集める。
 */
function AppMenu() {
  const setShortcutsOpen = useSetAtom(shortcutsOpenAtom);
  const setAppearanceOpen = useSetAtom(appearanceOpenAtom);
  const setNonce = useSetAtom(updateCheckNonceAtom);
  const status = useAtomValue(updateStatusAtom);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  return (
    <Dropdown icon="more_horiz" label="メニュー" title="メニュー" width={260} iconOnly>
      {(close) => (
        <>
          <p className="kd-menu__head">
            kodama{version ? ` v${version}` : ""}
          </p>

          {/* 起動時にも確認しているが、出たばかりの版をすぐ取りに行きたい
              ことがある。押すと合図を 1 つ進め、確認を走らせる。 */}
          <button
            className="kd-menuitem"
            disabled={status === "checking"}
            onClick={() => setNonce((n) => n + 1)}
          >
            <Icon name="system_update_alt" size={15} />
            <span className="kd-menuitem__text">更新を確認</span>
            {UPDATE_HINT[status] ? (
              <span className="kd-menuitem__hint">{UPDATE_HINT[status]}</span>
            ) : null}
          </button>

          <button
            className="kd-menuitem"
            onClick={() => {
              setAppearanceOpen(true);
              close();
            }}
          >
            <Icon name="palette" size={15} />
            <span className="kd-menuitem__text">表示</span>
          </button>

          <button
            className="kd-menuitem"
            onClick={() => {
              setShortcutsOpen(true);
              close();
            }}
          >
            <Icon name="keyboard" size={15} />
            <span className="kd-menuitem__text">キーボード操作</span>
            <span className="kd-menuitem__hint">?</span>
          </button>
        </>
      )}
    </Dropdown>
  );
}

interface TopBarProps {
  projects: Project[];
  progress: ReviewProgress;
  onReload: () => void;
}

/**
 * ドラッグ領域はこのコンテナだけに付ける。`data-tauri-drag-region` を持つ要素の
 * 子はドラッグ対象から外れるので、ボタン側に打ち消しの指定は要らない。
 */
export function TopBar({ projects, progress, onReload }: TopBarProps) {
  const [theme, setTheme] = useAtom(themeAtom);
  const [mode, setMode] = useAtom(viewModeAtom);
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

      <Icon name="chevron_right" size={14} className="kd-topbar__sep" />

      <WorktreeMenu />

      <Icon name="chevron_right" size={14} className="kd-topbar__sep" />

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

      <ProgressRing progress={progress} />

      {/* どちらか一方を選ぶので、両方を並べて出す。片方だけを押しボタンに
          すると、いま選ばれていない側が何なのか分からない。 */}
      <div className="kd-seg" role="group" aria-label="差分の並べ方">
        <button
          className="kd-seg__item"
          aria-pressed={mode === "unified"}
          title="縦に並べる (u)"
          onClick={() => setMode("unified")}
        >
          <Icon name="view_headline" size={16} />
        </button>
        <button
          className="kd-seg__item"
          aria-pressed={mode === "split"}
          title="左右に並べる (u)"
          onClick={() => setMode("split")}
        >
          <Icon name="vertical_split" size={16} />
        </button>
      </div>

      <IconButton name="refresh" label="再読込 (⌘R)" onClick={onReload} />
      <IconButton
        name={THEME_ICON[theme]}
        label={THEME_LABEL[theme]}
        onClick={() => setTheme(NEXT_THEME[theme])}
      />

      <AppMenu />
    </header>
  );
}
