import { useAtomValue } from "jotai";
import { useMemo } from "react";

import type { FileFilter } from "../lib/diff/filter";
import {
  fileFilterAtom,
  hiddenExtensionsAtom,
  showDeletedAtom,
  showViewedAtom,
  viewedAtom,
} from "../state/atoms";

/**
 * いまの絞り込み条件。ツリーと差分の両方で同じものを使う。
 *
 * 片方だけに効かせると、左に出ていないファイルが右に流れてきて、
 * 何を隠したのか分からなくなる。
 */
export function useFileFilter(): FileFilter {
  const query = useAtomValue(fileFilterAtom);
  const hiddenExtensions = useAtomValue(hiddenExtensionsAtom);
  const showDeleted = useAtomValue(showDeletedAtom);
  const showViewed = useAtomValue(showViewedAtom);
  const viewed = useAtomValue(viewedAtom);

  return useMemo(
    () => ({
      query: query.trim().toLowerCase(),
      hiddenExtensions,
      showDeleted,
      showViewed,
      viewed,
    }),
    [query, hiddenExtensions, showDeleted, showViewed, viewed],
  );
}
