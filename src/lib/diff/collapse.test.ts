import { describe, expect, it } from "vitest";

import type { DiffFile } from "../types";
import { OPEN_LINE_BUDGET, collapsedFiles, defaultCollapsed } from "./collapse";

function file(path: string, lines: number, generated = false): DiffFile {
  return {
    path,
    oldPath: null,
    status: "modified",
    additions: lines,
    deletions: 0,
    binary: false,
    generated,
    syntax: null,
    truncated: false,
    diffHash: path,
    hunks: [
      {
        oldStart: 1,
        oldLines: lines,
        newStart: 1,
        newLines: lines,
        header: "",
        lines: Array.from({ length: lines }, () => ({
          kind: "add" as const,
          oldNumber: null,
          newNumber: 1,
          content: "",
          noNewline: false,
          inline: null,
          tokens: null,
        })),
        rows: [],
      },
    ],
  };
}

describe("defaultCollapsed", () => {
  it("予算のぶんだけ上から開く", () => {
    const files = [file("a", OPEN_LINE_BUDGET), file("b", 10)];
    expect([...defaultCollapsed(files, {})]).toEqual(["b"]);
  });

  it("生成ファイルは量に関わらず畳む", () => {
    const files = [file("lock", 5, true), file("a", 10)];
    expect([...defaultCollapsed(files, {})]).toEqual(["lock"]);
  });

  it("生成ファイルは予算を使わない", () => {
    const files = [file("lock", OPEN_LINE_BUDGET * 2, true), file("a", 10)];
    expect(defaultCollapsed(files, {}).has("a")).toBe(false);
  });

  it("読み終えたファイルは畳む", () => {
    const files = [file("a", 10), file("b", 10)];
    expect([...defaultCollapsed(files, { a: "viewed" })]).toEqual(["a"]);
  });

  it("読んだあと変わったものは開いたままにする", () => {
    const files = [file("a", 10)];
    expect(defaultCollapsed(files, { a: "stale" }).has("a")).toBe(false);
  });

  /** 拡張子を隠して上位が消えたとき、残ったものが開き直ることの担保。 */
  it("渡された一覧の先頭から予算を配る", () => {
    const big = file("big", OPEN_LINE_BUDGET);
    const small = file("small", 10);
    expect(defaultCollapsed([big, small], {}).has("small")).toBe(true);
    expect(defaultCollapsed([small], {}).has("small")).toBe(false);
  });
});

describe("collapsedFiles", () => {
  it("自分で開いたものは既定より優先する", () => {
    const files = [file("a", OPEN_LINE_BUDGET), file("b", 10)];
    expect(collapsedFiles(files, {}, { b: true }).has("b")).toBe(false);
  });

  it("自分で畳んだものは開かない", () => {
    const files = [file("a", 10)];
    expect(collapsedFiles(files, {}, { a: false }).has("a")).toBe(true);
  });

  it("触っていないファイルは既定に従う", () => {
    const files = [file("lock", 5, true)];
    expect(collapsedFiles(files, {}, {}).has("lock")).toBe(true);
  });

  it("一覧に無いファイルは含めない", () => {
    const files = [file("a", 10)];
    expect([...collapsedFiles(files, { b: "viewed" }, { b: false })]).toEqual(
      [],
    );
  });
});
