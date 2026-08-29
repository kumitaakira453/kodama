import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";

import { api } from "../../lib/ipc";
import type { DiffFile } from "../../lib/types";
import { diffAtom, selectedWorktreeAtom } from "../../state/atoms";
import { RingSpinner } from "../ui/RingSpinner";

interface Pair {
  old: string | null;
  new: string | null;
}

/**
 * 画像の変更前後を並べて出す。
 *
 * 画像は本文の差分を読んでも変わったかどうか分からない。追加・削除では
 * 片側しか無いので、無い側は空きとして見せる。
 */
export function ImagePair({ file }: { file: DiffFile }) {
  const diff = useAtomValue(diffAtom);
  const worktree = useAtomValue(selectedWorktreeAtom);
  const [pair, setPair] = useState<Pair | null>(null);
  const [failed, setFailed] = useState(false);

  const spec = diff?.resolved.spec;
  const path = file.path;
  const oldPath = file.oldPath ?? path;

  useEffect(() => {
    if (!worktree || !spec) return;
    let alive = true;
    setPair(null);
    setFailed(false);

    Promise.all([
      api.readImage(worktree, spec, oldPath, "old"),
      api.readImage(worktree, spec, path, "new"),
    ])
      .then(([before, after]) => {
        if (alive) setPair({ old: before, new: after });
      })
      .catch(() => {
        // 読めなくても差分の他の部分は見られる。ここだけ諦める。
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
    };
  }, [worktree, spec, path, oldPath]);

  if (failed) {
    return <div className="kd-imgpair__note">画像を読めませんでした</div>;
  }
  if (!pair) {
    return (
      <div className="kd-imgpair__note">
        <RingSpinner size={20} />
      </div>
    );
  }

  return (
    <div className="kd-imgpair">
      <ImageSide label="変更前" src={pair.old} kind="del" />
      <ImageSide label="変更後" src={pair.new} kind="add" />
    </div>
  );
}

function ImageSide({
  label,
  src,
  kind,
}: {
  label: string;
  src: string | null;
  kind: "add" | "del";
}) {
  return (
    <figure className="kd-imgpair__side" data-kind={src ? kind : undefined}>
      <figcaption className="kd-imgpair__label">{label}</figcaption>
      {src ? (
        <img className="kd-imgpair__img" src={src} alt={label} />
      ) : (
        <span className="kd-imgpair__none">なし</span>
      )}
    </figure>
  );
}
