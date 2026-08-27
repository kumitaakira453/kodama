import { useSetAtom } from "jotai";
import { useCallback } from "react";

import { errorMessage } from "../lib/errors";
import { toastsAtom, type Toast } from "../state/atoms";

/** エラーは 8 秒、それ以外は 3 秒で自動的に消す。 */
const LIFETIME: Record<Toast["kind"], number> = {
  error: 8000,
  info: 3000,
  success: 3000,
};

let nextId = 1;

export function useToast() {
  const setToasts = useSetAtom(toastsAtom);

  const push = useCallback(
    (kind: Toast["kind"], text: string) => {
      const id = nextId++;
      setToasts((list) => [...list, { id, kind, text }]);
      window.setTimeout(
        () => setToasts((list) => list.filter((t) => t.id !== id)),
        LIFETIME[kind],
      );
    },
    [setToasts],
  );

  const showError = useCallback(
    (e: unknown) => push("error", errorMessage(e)),
    [push],
  );

  return { push, showError };
}
