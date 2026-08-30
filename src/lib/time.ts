const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 経過時間の短い言い方。
 *
 * 会話に添えるのは「いつ書かれたか」ではなく「どれくらい前か」。日付を並べると
 * 読み手が毎回引き算することになる。1 週間を越えたら日付に切り替える。
 */
export function relativeTime(millis: number, now = Date.now()): string {
  const diff = now - millis;
  if (diff < MINUTE) return "たった今";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 時間前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 日前`;
  const d = new Date(millis);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
