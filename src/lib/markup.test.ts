import { describe, expect, it } from "vitest";

import { parseInline } from "./markup";

describe("parseInline", () => {
  it("素の文はそのまま", () => {
    expect(parseInline("ふつうの文")).toEqual([
      { kind: "text", text: "ふつうの文" },
    ]);
  });

  it("バッククォートを識別子として切る", () => {
    expect(parseInline("a `foo` b")).toEqual([
      { kind: "text", text: "a " },
      { kind: "code", text: "foo" },
      { kind: "text", text: " b" },
    ]);
  });

  it("** を強調として切る", () => {
    expect(parseInline("これは **軸** です")).toEqual([
      { kind: "text", text: "これは " },
      { kind: "strong", text: "軸" },
      { kind: "text", text: " です" },
    ]);
  });

  it("強調が続いても全部切る", () => {
    expect(parseInline("**あ** と **い**")).toEqual([
      { kind: "strong", text: "あ" },
      { kind: "text", text: " と " },
      { kind: "strong", text: "い" },
    ]);
  });

  /** 識別子の中は書かれたまま。ここを崩すと意味が変わる。 */
  it("識別子の中の ** は強調にしない", () => {
    expect(parseInline("`a ** b`")).toEqual([{ kind: "code", text: "a ** b" }]);
  });

  it("閉じていない ** は文字のまま", () => {
    expect(parseInline("**閉じない")).toEqual([
      { kind: "text", text: "**閉じない" },
    ]);
  });

  it("中身の無い **** は強調にしない", () => {
    expect(parseInline("****")).toEqual([{ kind: "text", text: "****" }]);
  });

  it("閉じていないバッククォートは文字のまま", () => {
    expect(parseInline("`閉じない")).toEqual([
      { kind: "text", text: "`閉じない" },
    ]);
  });

  it("識別子と強調が混ざっても順が崩れない", () => {
    expect(parseInline("**軸** は `dimension` です")).toEqual([
      { kind: "strong", text: "軸" },
      { kind: "text", text: " は " },
      { kind: "code", text: "dimension" },
      { kind: "text", text: " です" },
    ]);
  });

  it("改行は保つ", () => {
    expect(parseInline("上\n下")).toEqual([{ kind: "text", text: "上\n下" }]);
  });
});
