/**
 * 文字列を貼り付け先へ渡す。
 *
 * 新しい経路が使えない環境では、選択を作って複製する古い手に落とす。
 * 失敗を黙って飲まず、呼び出し側が知らせられるよう投げ直す。
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const area = document.createElement("textarea");
  area.value = text;
  // 画面外に置く。表示すると、その瞬間だけ画面が動く。
  area.style.position = "fixed";
  area.style.top = "-1000px";
  document.body.appendChild(area);
  try {
    area.select();
    if (!document.execCommand("copy")) {
      throw new Error("コピーできませんでした。");
    }
  } finally {
    area.remove();
  }
}
