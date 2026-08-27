import { useCallback, useRef } from "react";

interface ResizerProps {
  /** ドラッグの水平移動量を受け取る。呼び出し側が幅をクランプして保存する。 */
  onDrag: (dx: number) => void;
}

/**
 * ペイン境界のドラッグハンドル。追従に遅延があると掴んだ感覚が壊れるため、
 * ドラッグ中は `kd-resizing` を立てて全トランジションを止める。
 */
export function Resizer({ onDrag }: ResizerProps) {
  const last = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      last.current = e.clientX;
      e.currentTarget.setPointerCapture(e.pointerId);
      document.documentElement.classList.add("kd-resizing");
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - last.current;
      if (dx === 0) return;
      last.current = e.clientX;
      onDrag(dx);
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
      className="kd-resizer"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}
