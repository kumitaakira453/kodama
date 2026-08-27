import { useAtomValue } from "jotai";
import { useEffect } from "react";

import { motionAtom, themeAtom } from "../state/atoms";

/**
 * テーマと動きの設定を `documentElement` の data 属性へ写す。CSS 側は属性で
 * トークンを差し替えるだけで済み、色の計算が JS に漏れない。
 */
export function useTheme() {
  const theme = useAtomValue(themeAtom);
  const motion = useAtomValue(motionAtom);

  useEffect(() => {
    const root = document.documentElement;
    if (theme !== "system") {
      root.dataset.theme = theme;
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      root.dataset.theme = media.matches ? "light" : "dark";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);
}
