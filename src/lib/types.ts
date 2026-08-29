/**
 * Rust の DTO と 1:1 で対応する型。すべて camelCase で直列化される。
 *
 * `InlineRange` と `Token` のオフセットは UTF-16 コードユニット単位で、
 * JS の文字列インデックスにそのまま使える。
 */

export interface Project {
  id: string;
  name: string;
  path: string;
  addedAt: number;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  subject: string;
  body: string;
  author: string;
  /** committer 日時の epoch 秒。 */
  timestamp: number;
  relative: string;
}

export interface WorktreeInfo {
  path: string;
  name: string;
  branch: string | null;
  head: string | null;
  detached: boolean;
  locked: boolean;
  bare: boolean;
  isMain: boolean;
}

export interface WorktreeStatus {
  path: string;
  dirty: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  lastCommit: CommitInfo | null;
  /** 状態取得に失敗した理由。取得できていれば null。 */
  error: string | null;
}

export type PrState = "draft" | "open" | "merged" | "closed";

export interface PrInfo {
  number: number;
  title: string;
  state: PrState;
  url: string;
}

export interface RevisionList {
  commits: CommitInfo[];
  branches: string[];
  /** merge-base 比較に使える既定の base ref。見つからなければ null。 */
  defaultBase: string | null;
  /** `defaultBase` から現在までに含まれるコミットの sha。 */
  branchShas: string[];
}

/** 何と何の差分を見るか。 */
export type DiffSpec =
  /** 連続したコミット群。oldest の第 1 親から newest までを見る。 */
  | { kind: "commitRange"; oldest: string; newest: string }
  | { kind: "range"; base: string; target: string; mergeBase: boolean }
  /** 全未コミット変更。 */
  | { kind: "uncommitted" }
  /** index と HEAD の差分。 */
  | { kind: "staged" }
  /** 作業ツリーと index の差分。 */
  | { kind: "unstaged" };

export type DiffFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked";

export type DiffLineKind = "context" | "add" | "del";

/** 行内で変化した範囲。ここに含まれない範囲は反対側の行と一致している。 */
export interface InlineRange {
  start: number;
  len: number;
}

export type TokenKind =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "type"
  | "variable"
  | "constant"
  | "operator"
  | "punctuation"
  | "tag"
  | "attribute"
  | "plain";

/** 構文トークン。隣接する同種トークンは Rust 側でマージ済み。 */
export interface Token {
  start: number;
  len: number;
  kind: TokenKind;
}

export interface DiffLine {
  kind: DiffLineKind;
  oldNumber: number | null;
  newNumber: number | null;
  /** 先頭の +/-/空白 を除いた本文。 */
  content: string;
  /** `\ No newline at end of file` が続く行。 */
  noNewline: boolean;
  inline: InlineRange[] | null;
  tokens: Token[] | null;
}

/** split 表示の 1 行。値は同一 hunk の lines へのインデックス。 */
export interface DiffRow {
  left: number | null;
  right: number | null;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** @@ の後ろに付く関数名などの文脈。 */
  header: string;
  /** unified はこの順に描く。 */
  lines: DiffLine[];
  /** split はこの順に描く。 */
  rows: DiffRow[];
}

export interface DiffFile {
  path: string;
  oldPath: string | null;
  status: DiffFileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  /** 自動折りたたみの対象か。 */
  generated: boolean;
  /** syntect が選んだ構文の名前。判別できなければ null。 */
  syntax: string | null;
  /** hunks を省いた場合に true。ファイル選択時に取り直す。 */
  truncated: boolean;
  /** 閲覧済みマークの陳腐化判定に使う、この差分内容のハッシュ。 */
  diffHash: string;
  hunks: DiffHunk[];
}

/** 解決済みの比較指定。 */
export interface ResolvedSpec {
  spec: DiffSpec;
  /** コメント・閲覧済みの保存キー。 */
  revisionKey: string;
  baseLabel: string;
  targetLabel: string;
  /** 内容が変わり得る指定か。true のときだけファイル監視を張る。 */
  mutable: boolean;
}

export interface DiffResponse {
  resolved: ResolvedSpec;
  files: DiffFile[];
  truncated: boolean;
}

export type Side = "old" | "new";

export interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: number;
}

export type ThreadStatus =
  | { kind: "open" }
  | { kind: "resolved"; by: string; at: number }
  | { kind: "dropped"; by: string; at: number };

export interface Thread {
  id: string;
  repo: string;
  revisionKey: string;
  file: string;
  side: Side;
  lineStart: number;
  lineEnd: number;
  /** 指摘時点の該当行の逐語。位置が特定できなくなっても対象を見失わない。 */
  quote: string;
  context: string;
  baseHash: string;
  status: ThreadStatus;
  comments: Comment[];
  createdAt: number;
}

/**
 * 指摘の対象が今どうなっているか。
 * `status`（解決したか）とは別の軸で持つ。混ぜると書き換わった指摘が一覧から消える。
 */
export type AnchorState =
  | { kind: "unchanged" }
  | { kind: "moved"; line: number }
  | { kind: "rewritten" }
  | { kind: "removed" }
  | { kind: "committed"; sha: string }
  | { kind: "noFile" };

export interface ThreadView {
  thread: Thread;
  anchor: AnchorState;
  currentText: string | null;
}

/** 指摘を作るときに渡す内容。 */
export interface ThreadInput {
  repo: string;
  revisionKey: string;
  file: string;
  side: Side;
  lineStart: number;
  lineEnd: number;
  quote: string;
  context: string;
  body: string;
  author: string;
}

/** 閲覧後に差分が変わった状態を `stale` として区別する。 */
export type ViewedStatus = "unviewed" | "viewed" | "stale";

export interface ViewedState {
  file: string;
  status: ViewedStatus;
}

export type ViewMode = "split" | "unified";

/** 監視から届く通知。 */
export interface WatchEvent {
  kind: "files" | "ledger";
}

/** 今この環境で起動できるアプリ。 */
export interface AppTarget {
  id: string;
  label: string;
  /** 行番号を指定して開けるか。 */
  supportsLine: boolean;
}
