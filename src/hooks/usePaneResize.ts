import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import type { PrimitiveAtom } from "jotai";

/**
 * 3 ペインそれぞれの最小幅。合計 900 + リサイザ分が窓の最小幅の根拠。
 *
 * diff の最小幅は「行番号 50px + 記号 20px + コード 40 桁ぶん」を左右 2 列ぶん
 * 置ける量から決めている。これを切ると split 表示が実用にならない。
 */
export const MIN_TREE = 240;
export const MIN_FILES = 280;
export const MIN_DIFF = 380;

interface PaneResize {
  treeWidth: number;
  filesWidth: number;
  dragTree: (dx: number) => void;
  dragFiles: (dx: number) => void;
}

/**
 * ペイン幅のドラッグとクランプ。右ペインが `MIN_DIFF` を切らないよう、
 * ウィンドウ幅から逆算して上限を決める。窓のリサイズにも追従する。
 */
export function usePaneResize(
  treeAtom: PrimitiveAtom<number>,
  filesAtom: PrimitiveAtom<number>,
): PaneResize {
  const [treeWidth, setTreeWidth] = useAtom(treeAtom);
  const [filesWidth, setFilesWidth] = useAtom(filesAtom);

  const clamp = useCallback((tree: number, files: number) => {
    const available = window.innerWidth - MIN_DIFF;
    const t = Math.max(MIN_TREE, Math.min(tree, available - MIN_FILES));
    const f = Math.max(MIN_FILES, Math.min(files, available - t));
    return { tree: t, files: f };
  }, []);

  const dragTree = useCallback(
    (dx: number) => {
      setTreeWidth((w) => clamp(w + dx, filesWidth).tree);
    },
    [setTreeWidth, clamp, filesWidth],
  );

  const dragFiles = useCallback(
    (dx: number) => {
      setFilesWidth((w) => clamp(treeWidth, w + dx).files);
    },
    [setFilesWidth, clamp, treeWidth],
  );

  useEffect(() => {
    const onResize = () => {
      const next = clamp(treeWidth, filesWidth);
      if (next.tree !== treeWidth) setTreeWidth(next.tree);
      if (next.files !== filesWidth) setFilesWidth(next.files);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp, treeWidth, filesWidth, setTreeWidth, setFilesWidth]);

  return { treeWidth, filesWidth, dragTree, dragFiles };
}
