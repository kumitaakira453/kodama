import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";

import type { Project } from "../../lib/types";
import { selectedProjectIdAtom, settingsOpenAtom } from "../../state/atoms";
import { Icon } from "../ui/Icon";

interface ProjectSwitcherProps {
  projects: Project[];
}

/**
 * 現在のプロジェクトの表示と切替。登録後はめったに切り替えないので、ペインを
 * 常時割かずタイトルバーの 1 要素に収める。
 */
export function ProjectSwitcher({ projects }: ProjectSwitcherProps) {
  const [selectedId, setSelectedId] = useAtom(selectedProjectIdAtom);
  const [settingsOpen, setSettingsOpen] = useAtom(settingsOpenAtom);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = projects.find((p) => p.id === selectedId) ?? projects[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="kd-switcher" ref={ref}>
      <button
        className="kd-switcher__button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <RingMark />
        <span className="kd-switcher__name">
          {current?.name ?? "プロジェクトなし"}
        </span>
        <Icon name="expand_more" size={16} />
      </button>

      {open ? (
        <div className="kd-switcher__menu" role="listbox">
          {projects.map((p) => (
            <button
              key={p.id}
              role="option"
              aria-selected={p.id === current?.id}
              className="kd-switcher__item"
              onClick={() => {
                setSelectedId(p.id);
                setOpen(false);
              }}
              title={p.path}
            >
              <Icon
                name={p.id === current?.id ? "radio_button_checked" : "radio_button_unchecked"}
                size={15}
              />
              <span className="kd-switcher__itemname">{p.name}</span>
            </button>
          ))}
          <div className="kd-switcher__sep" />
          <button
            className="kd-switcher__item"
            onClick={() => {
              setOpen(false);
              setSettingsOpen(!settingsOpen);
            }}
          >
            <Icon name="settings" size={15} />
            <span className="kd-switcher__itemname">プロジェクトを管理…</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** 年輪のマーク。アプリの記号として全画面で共通に使う。 */
function RingMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9.5"
        fill="none"
        stroke="var(--kd-accent)"
        strokeWidth="1.8"
        opacity="0.45"
      />
      <circle
        cx="12"
        cy="12"
        r="5.5"
        fill="none"
        stroke="var(--kd-accent)"
        strokeWidth="1.8"
        opacity="0.75"
      />
      <circle cx="12" cy="12" r="2.2" fill="var(--kd-accent)" />
    </svg>
  );
}
