/** 画像として見せる拡張子。Rust 側の一覧と合わせる。 */
const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
  "ico",
  "svg",
]);

/**
 * 画像として見せるファイルか。
 *
 * svg は git ではテキストなので差分も読めるが、形が変わったかは絵を見ないと
 * 分からない。差分と並べて出す。
 */
export function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}
