/** 配色（構文）の選択肢。値は `data-syntax` にそのまま入る。 */
export interface SyntaxTheme {
  id: string;
  label: string;
}

/**
 * 既定（`kodama`）は属性を立てない。土台のテーマが持つ値がそのまま効くので、
 * 同じ色を二重に書かずに済む。
 */
export const DEFAULT_SYNTAX = "kodama";

export const LIGHT_SYNTAX: SyntaxTheme[] = [
  { id: DEFAULT_SYNTAX, label: "木漏れ日（既定）" },
  { id: "github-light", label: "GitHub Light" },
  { id: "one-light", label: "One Light" },
  { id: "solarized-light", label: "Solarized Light" },
  { id: "gruvbox-light", label: "Gruvbox Light" },
  { id: "latte", label: "Catppuccin Latte" },
];

export const DARK_SYNTAX: SyntaxTheme[] = [
  { id: DEFAULT_SYNTAX, label: "夜の林（既定）" },
  { id: "github-dark", label: "GitHub Dark" },
  { id: "one-dark", label: "One Dark" },
  { id: "dracula", label: "Dracula" },
  { id: "nord", label: "Nord" },
  { id: "monokai", label: "Monokai" },
  { id: "solarized-dark", label: "Solarized Dark" },
  { id: "tokyo-night", label: "Tokyo Night" },
  { id: "gruvbox-dark", label: "Gruvbox Dark" },
];

export interface FontOption {
  id: string;
  label: string;
  /**
   * `--kd-font-mono` に入れる指定。CSS に書かずここに置く。見本と本文で
   * 同じ 1 つを見るので、片方だけ変えて食い違うことがない。
   */
  stack: string;
  /**
   * 実在を確かめる書体名。macOS に必ずあるものは省く。
   * 入っていない書体を一覧に出すと、選んでも何も変わらない項目になる。
   */
  probe?: string;
  /** 等幅でないもの。桁が揃わなくなる旨を添える。 */
  proportional?: boolean;
}

export const DEFAULT_FONT = "system";

export const FONTS: FontOption[] = [
  {
    id: DEFAULT_FONT,
    label: "システム等幅（既定）",
    stack: 'ui-monospace, "SF Mono", Menlo, Monaco, "Hiragino Sans", monospace',
  },
  { id: "menlo", label: "Menlo", stack: "Menlo, monospace" },
  { id: "monaco", label: "Monaco", stack: "Monaco, monospace" },
  { id: "andale", label: "Andale Mono", stack: '"Andale Mono", monospace' },
  { id: "courier", label: "Courier New", stack: '"Courier New", monospace' },
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    stack: '"JetBrains Mono", monospace',
    probe: "JetBrains Mono",
  },
  {
    id: "fira",
    label: "Fira Code",
    stack: '"Fira Code", monospace',
    probe: "Fira Code",
  },
  {
    id: "source",
    label: "Source Code Pro",
    stack: '"Source Code Pro", monospace',
    probe: "Source Code Pro",
  },
  {
    id: "ibm-plex",
    label: "IBM Plex Mono",
    stack: '"IBM Plex Mono", monospace',
    probe: "IBM Plex Mono",
  },
  {
    id: "cascadia",
    label: "Cascadia Code",
    stack: '"Cascadia Code", monospace',
    probe: "Cascadia Code",
  },
  { id: "hack", label: "Hack", stack: "Hack, monospace", probe: "Hack" },
  {
    id: "inconsolata",
    label: "Inconsolata",
    stack: "Inconsolata, monospace",
    probe: "Inconsolata",
  },
  {
    id: "roboto",
    label: "Roboto Mono",
    stack: '"Roboto Mono", monospace',
    probe: "Roboto Mono",
  },
  {
    id: "gothic",
    label: "ゴシック",
    stack: '"Hiragino Sans", "Helvetica Neue", sans-serif',
    proportional: true,
  },
  {
    id: "mincho",
    label: "明朝",
    stack: '"Hiragino Mincho ProN", YuMincho, "Yu Mincho", serif',
    proportional: true,
  },
];

export function fontStack(id: string): string | null {
  return FONTS.find((f) => f.id === id)?.stack ?? null;
}

/** 幅を測るのに使う文字列。字幅の差が出るよう、太い字と細い字を混ぜる。 */
const RULER = "MMMMWWWWiiiillll0123456789";
const FALLBACKS = ["monospace", "serif", "sans-serif"];

/**
 * その書体が入っているか。
 *
 * `document.fonts.check()` は入っていない書体にも true を返すので使えない。
 * 総称ファミリだけで測った幅と、先頭に書体を足して測った幅を比べ、どれか 1 つ
 * でも変われば実際に使われたと分かる。
 */
export function isInstalled(family: string): boolean {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const width = (spec: string) => {
    ctx.font = `16px ${spec}`;
    return ctx.measureText(RULER).width;
  };
  return FALLBACKS.some((base) => width(`"${family}", ${base}`) !== width(base));
}

/** 一覧から、実在しない書体を落としたもの。 */
export function availableFonts(): FontOption[] {
  return FONTS.filter((f) => !f.probe || isInstalled(f.probe));
}
