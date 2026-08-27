import { useCallback, useRef } from "react";

interface HResizerProps {
  /** ドラッグの垂直移動量を受け取る。呼び出し側が高さをクランプして保存する。 */
  onDrag: (dy: number) => void;
}

/** ペインを上下に分ける境界のハンドル。 */
export function HResizer({ onDrag }: HResizerProps) {
  const last = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      last.current = e.clientY;
      e.currentTarget.setPointerCapture(e.pointerId);
      document.documentElement.classList.add("kd-resizing");
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const dy = e.clientY - last.current;
      if (dy === 0) return;
      last.current = e.clientY;
      onDrag(dy);
    },
    [onDrag],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      document.documentElement.classList.remove("kd-resizing");
    },
    [],
  );

  return (
    <div
      className="kd-hresizer"
      role="separator"
      aria-orientation="horizontal"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}
