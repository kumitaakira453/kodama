import { describe, expect, it } from "vitest";

import { covers, resolveRange, stepRange, type CommitSelection } from "./revisions";
import type { CommitInfo } from "./types";

/** 一覧は新しい順。添字 0 が最新。 */
const COMMITS: CommitInfo[] = ["c0", "c1", "c2", "c3", "c4"].map((sha) => ({
  sha,
  shortSha: sha,
  subject: sha,
  body: "",
  author: "汲田 晶",
  timestamp: 0,
  relative: "たった今",
}));

/** 選択に入っている sha を一覧の順に並べる。 */
function selected(selection: CommitSelection | null): string[] {
  if (!selection) return [];
  const range = resolveRange(selection, COMMITS);
  if (!range) return [];
  const top = COMMITS.findIndex((c) => c.sha === range.newest.sha);
  const bottom = COMMITS.findIndex((c) => c.sha === range.oldest.sha);
  return COMMITS.slice(top, bottom + 1).map((c) => c.sha);
}

describe("stepRange", () => {
  it("最初の 1 件はその 1 件だけを選ぶ", () => {
    expect(selected(stepRange(null, COMMITS, "c2"))).toEqual(["c2"]);
  });

  it("すべてを選んだ状態から押しても、その 1 件から選び直す", () => {
    // ここで縮小として扱うと、2 件目を押すまでに範囲が別物になり、
    // 複数選べないように見える。
    const all: CommitSelection = { kind: "pseudo", id: "branch" };
    expect(selected(stepRange(all, COMMITS, "c2"))).toEqual(["c2"]);
  });

  it("2 件目を押すと、あいだのコミットも入る", () => {
    const one = stepRange(null, COMMITS, "c1");
    expect(selected(stepRange(one, COMMITS, "c4"))).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
    ]);
  });

  it("3 件目が範囲の外なら、そこまで広がる", () => {
    let s = stepRange(null, COMMITS, "c1");
    s = stepRange(s, COMMITS, "c3");
    s = stepRange(s, COMMITS, "c0");
    expect(selected(s)).toEqual(["c0", "c1", "c2", "c3"]);
  });

  it("広げた範囲は押すたびに捨てられない", () => {
    // 起点と終点だけを覚える方式では、ここで c1 までの広がりが消えていた。
    let s = stepRange(null, COMMITS, "c2");
    s = stepRange(s, COMMITS, "c1");
    s = stepRange(s, COMMITS, "c4");
    expect(selected(s)).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("範囲の中を押すと、その行とそれより下が外れる", () => {
    let s = stepRange(null, COMMITS, "c0");
    s = stepRange(s, COMMITS, "c4");
    expect(selected(stepRange(s, COMMITS, "c3"))).toEqual(["c0", "c1", "c2"]);
    expect(selected(stepRange(s, COMMITS, "c1"))).toEqual(["c0"]);
  });

  it("範囲の一番上を押すと何も残らない", () => {
    let s = stepRange(null, COMMITS, "c1");
    s = stepRange(s, COMMITS, "c3");
    expect(stepRange(s, COMMITS, "c1")).toBeNull();
  });

  it("1 件だけの状態でその行を押すと外れる", () => {
    const one = stepRange(null, COMMITS, "c2");
    expect(stepRange(one, COMMITS, "c2")).toBeNull();
  });

  it("一覧に無い sha は選択を変えない", () => {
    const one = stepRange(null, COMMITS, "c2");
    expect(stepRange(one, COMMITS, "zz")).toBe(one);
  });
});

describe("covers", () => {
  it("未コミットの変更はステージ済みと未ステージを含む", () => {
    const s: CommitSelection = { kind: "pseudo", id: "uncommitted" };
    expect(covers(s, "staged")).toBe(true);
    expect(covers(s, "unstaged")).toBe(true);
    expect(covers(s, "branch")).toBe(false);
  });

  it("すべての変更はどれも含む", () => {
    const s: CommitSelection = { kind: "pseudo", id: "everything" };
    for (const id of ["branch", "uncommitted", "staged", "unstaged"] as const) {
      expect(covers(s, id)).toBe(true);
    }
  });

  it("コミットの範囲は疑似的な選択肢を含まない", () => {
    const s: CommitSelection = { kind: "commits", anchor: "c1", focus: "c2" };
    expect(covers(s, "branch")).toBe(false);
  });
});
