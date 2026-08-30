import { useAtomValue } from "jotai";
import { useEffect } from "react";

import { DEFAULT_SYNTAX, fontStack } from "../lib/appearance";
import {
  codeFontAtom,
  motionAtom,
  syntaxDarkAtom,
  syntaxLightAtom,
  themeAtom,
} from "../state/atoms";

/**
 * テーマと動きの設定を `documentElement` の data 属性へ写す。CSS 側は属性で
 * トークンを差し替えるだけで済み、色の計算が JS に漏れない。
 */
export function useTheme() {
  const theme = useAtomValue(themeAtom);
  const motion = useAtomValue(motionAtom);
  const light = useAtomValue(syntaxLightAtom);
  const dark = useAtomValue(syntaxDarkAtom);
  const font = useAtomValue(codeFontAtom);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);

  useEffect(() => {
    const syntax = theme === "dark" ? dark : light;
    // 既定はテーマが持つ色をそのまま使う。属性を立てないことで、同じ色を
    // 配色側にもう一度書かずに済む。
    if (syntax === DEFAULT_SYNTAX) delete document.documentElement.dataset.syntax;
    else document.documentElement.dataset.syntax = syntax;
  }, [theme, light, dark]);

  useEffect(() => {
    const stack = fontStack(font);
    // 差分の面はどこも `--kd-font-mono` を見る。行番号の幅も同じ書体の `1ch`
    // で決まるので、1 つ差し替えれば桁がずれない。
    if (stack) document.documentElement.style.setProperty("--kd-font-mono", stack);
    else document.documentElement.style.removeProperty("--kd-font-mono");
  }, [font]);
}
