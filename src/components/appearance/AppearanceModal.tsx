import { useAtom } from "jotai";
import { useMemo } from "react";

import {
  DARK_SYNTAX,
  DEFAULT_SYNTAX,
  LIGHT_SYNTAX,
  availableFonts,
  type SyntaxTheme,
} from "../../lib/appearance";
import {
  codeFontAtom,
  syntaxDarkAtom,
  syntaxLightAtom,
  themeAtom,
  type Theme,
} from "../../state/atoms";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";

const THEME_LABEL: Record<Theme, string> = {
  light: "ライト",
  dark: "ダーク",
};

/**
 * 見た目の設定。
 *
 * 配色は明暗それぞれに持つ。片方だけ選べる形にすると、テーマを切り替えた
 * 先で背景と合わない色が残る。
 */
export function AppearanceModal({ onClose }: { onClose: () => void }) {
  const [theme, setTheme] = useAtom(themeAtom);
  const [light, setLight] = useAtom(syntaxLightAtom);
  const [dark, setDark] = useAtom(syntaxDarkAtom);
  const [font, setFont] = useAtom(codeFontAtom);

  // 実在する書体だけを出す。選んでも何も変わらない項目を並べない。
  const fonts = useMemo(availableFonts, []);

  return (
    <Modal title="表示" onClose={onClose}>
      <div className="kd-appear">
        <section className="kd-appear__group">
          <h3 className="kd-appear__title">テーマ</h3>
          <div className="kd-appear__row">
            {(["light", "dark"] as Theme[]).map((t) => (
              <button
                key={t}
                className="kd-appear__mode"
                data-selected={t === theme || undefined}
                onClick={() => setTheme(t)}
              >
                <Icon name={t === "light" ? "light_mode" : "dark_mode"} size={15} />
                {THEME_LABEL[t]}
              </button>
            ))}
          </div>
        </section>

        <SyntaxGroup
          title="配色（ライト）"
          themes={LIGHT_SYNTAX}
          value={light}
          defaultPreview="kodama-light"
          onPick={(id) => {
            setLight(id);
            setTheme("light");
          }}
        />

        <SyntaxGroup
          title="配色（ダーク）"
          themes={DARK_SYNTAX}
          value={dark}
          defaultPreview="kodama-dark"
          onPick={(id) => {
            setDark(id);
            setTheme("dark");
          }}
        />

        <section className="kd-appear__group">
          <h3 className="kd-appear__title">差分の書体</h3>
          <div className="kd-appear__grid">
            {fonts.map((f) => (
              <button
                key={f.id}
                className="kd-appear__font"
                data-selected={f.id === font || undefined}
                onClick={() => setFont(f.id)}
              >
                <span className="kd-appear__fontname">{f.label}</span>
                <span
                  className="kd-appear__sample"
                  style={{ fontFamily: f.stack }}
                  aria-hidden
                >
                  const x = 1;
                </span>
                {f.proportional ? (
                  <span className="kd-appear__note">桁は揃いません</span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}

/**
 * 配色の一覧。選ぶと、その配色が属する明暗へ切り替える。
 * 選んだのに何も変わらないと、効いているのか分からない。
 */
function SyntaxGroup({
  title,
  themes,
  value,
  defaultPreview,
  onPick,
}: {
  title: string;
  themes: SyntaxTheme[];
  value: string;
  /** 既定の見本に使う鍵。明暗で同じ id を使うので、見本だけ分ける。 */
  defaultPreview: string;
  onPick: (id: string) => void;
}) {
  return (
    <section className="kd-appear__group">
      <h3 className="kd-appear__title">{title}</h3>
      <div className="kd-appear__grid">
        {themes.map((t) => (
          <button
            key={t.id}
            className="kd-appear__theme"
            data-selected={t.id === value || undefined}
            onClick={() => onPick(t.id)}
          >
            <span
              className="kd-appear__swatches"
              data-syntax-preview={t.id === DEFAULT_SYNTAX ? defaultPreview : t.id}
            >
              <i className="kd-appear__dot" data-tok="keyword" />
              <i className="kd-appear__dot" data-tok="string" />
              <i className="kd-appear__dot" data-tok="function" />
              <i className="kd-appear__dot" data-tok="type" />
              <i className="kd-appear__dot" data-tok="comment" />
            </span>
            <span className="kd-appear__name">{t.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
