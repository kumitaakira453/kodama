import { describe, expect, it } from "vitest";

import { faceOf } from "./author";
import { relativeTime } from "./time";

describe("faceOf", () => {
  it("GUI が入れる you を人として扱う", () => {
    expect(faceOf("you")).toMatchObject({ kind: "you", label: "あなた" });
  });

  it("CLI が既定で入れる AI を見分ける", () => {
    expect(faceOf("AI")).toMatchObject({ kind: "ai", label: "AI" });
  });

  it("大文字小文字は問わない", () => {
    expect(faceOf("You").kind).toBe("you");
    expect(faceOf("ai").kind).toBe("ai");
  });

  it("知らない名前はそのまま出す", () => {
    expect(faceOf("汲田")).toMatchObject({ kind: "other", label: "汲田" });
  });

  it("空の名前でも表示は空にしない", () => {
    expect(faceOf("  ").label).toBe("不明");
  });
});

describe("relativeTime", () => {
  const now = new Date(2026, 7, 30, 12, 0, 0).getTime();

  it("1 分未満はたった今", () => {
    expect(relativeTime(now - 30_000, now)).toBe("たった今");
  });

  it("分・時間・日で言い方を変える", () => {
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 分前");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 時間前");
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe("2 日前");
  });

  it("1 週間を越えたら日付にする", () => {
    expect(relativeTime(new Date(2026, 6, 1).getTime(), now)).toBe("2026/7/1");
  });
});
