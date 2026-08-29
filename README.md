# 🌳 kodama

git worktree に対応した diff レビューアプリ。人間が GUI で指摘を書き、AI が
ターミナルから CLI で読んで返信・解決する。

Tauri 2 + Rust バックエンド + React。Node ランタイム不要の単一バイナリで、
GUI と CLI を同じ実行ファイルが兼ねる。

## できること

- **複数プロジェクトの worktree を横断して見る** — ブランチ名だけでなく、
  未コミットの有無・最終コミット・上流との差・PR の状態まで一覧に出る
- **比較対象を柔軟に選ぶ** — 未コミット / ステージ済み / 未ステージ / ブランチ全体
  （merge-base）/ コミット 1 件 / 連続したコミット群
- **GitHub 風の diff** — 全ファイルを 1 本のスクロールに積み、split と 1 列を
  切り替えられる。行内差分の強調と構文ハイライト付き
- **行に指摘を書く** — 行番号をクリック（Shift で範囲）してコメントする
- **AI と往復する** — 書いた指摘は `kodama review list` から読め、AI が
  `reply` / `resolve` で返す。GUI は監視していて即座に反映する
- **閲覧済みの管理** — 読み終えたファイルに印を付けると畳まれる。印のあとで
  差分が変われば未読に戻る
- **エディタで開く** — インストール済みのものだけを列挙して行番号付きで開く

## 動作要件

- macOS（Apple Silicon）
- git
- PR の表示に GitHub CLI（`gh`）。無くても動く

## 開発

```bash
npm install
npm run tauri dev     # Vite(5319) + ネイティブウィンドウ
npm run build         # tsc --noEmit + vite build
cd src-tauri && cargo test
```

## インストール

```bash
npm run tauri build
cp -R "src-tauri/target/release/bundle/macos/kodama.app" /Applications/
```

CLI を使うには実行ファイルに PATH を通す。

```bash
ln -sf /Applications/kodama.app/Contents/MacOS/kodama /usr/local/bin/kodama
```

未署名のため初回は Gatekeeper に止められることがある。その場合は
「システム設定 → プライバシーとセキュリティ」で許可するか、
`xattr -dr com.apple.quarantine /Applications/kodama.app` を実行する。

### 自動更新を有効にする

アプリは起動時とメニューの「更新を確認」で新しい版を探すが、成果物に署名が
無いと受け取れない。鍵を用意して初めて動く。

```bash
npx tauri signer generate -w ~/.tauri/kodama.key
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/kodama.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

そのうえで 3 か所を戻す。

| 場所 | 設定 |
|------|------|
| `src-tauri/tauri.conf.json` | `plugins.updater.pubkey` に公開鍵 |
| `src-tauri/tauri.conf.json` | `bundle.createUpdaterArtifacts` を `true` |
| `.github/workflows/release.yml` | `includeUpdaterJson` を `true` |

### AI 側のスキル

指摘への対応手順をまとめたスキルを同梱している。入れておくと「レビュー見て」の
一言で、`kodama review list` から `reply` / `resolve` までの流れを踏んでくれる。

```bash
# どのリポジトリでも使う
cp -R skills/kodama-review ~/.claude/skills/

# 特定のリポジトリだけで使う
cp -R skills/kodama-review <対象リポジトリ>/.claude/skills/
```

## レビューの流れ

### 1. 人間が GUI で指摘を書く

worktree と比較対象を選び、diff の行番号をクリックしてコメントする。
Shift+クリックで範囲を指定できる。

### 2. AI がターミナルから読む

```bash
kodama review list
```

現在地の worktree に属する未解決の指摘が Markdown で出る。**指摘した時点の
逐語引用が必ず添えられる**ので、位置が特定できなくなっても対象を見失わない。

```markdown
## src/app.py

### 指摘 #a3f10000 — 対象は指摘のあと移動しています（現在 37 行目）
場所: def render_with_file
比較: SB-2894 の未コミット変更

指摘時の行（34）:
```python
    button = get("user:upload")
```

会話:
- you: name の指定が追随していない
```

### 3. AI が直して返す

```bash
kodama review reply a3f10000 --body "featuresMember:upload へ揃えました"
kodama review resolve a3f10000
```

**GUI は台帳を監視しているので、返信も解決もその場で画面に反映される。**

## CLI

```
kodama review list    [--worktree <DIR>] [--commit <KEY>] [--path <PREFIX>]
                      [--status open|all] [--format md|json]
kodama review show    <THREAD_ID> [--format md|json]
kodama review reply   <THREAD_ID> --body <TEXT> [--author AI]
kodama review resolve <THREAD_ID> [--by AI]
kodama review reopen  <THREAD_ID>
kodama review drop    <THREAD_ID> [--by AI]      対象が消えたので取り下げる
```

`--worktree` を省くと現在地から解決する（`git rev-parse --show-toplevel`）。

**ファイル名だけでは絞り込めない。** 同じ `src/App.tsx` でも、どの worktree の
どの比較に対する指摘かで別物になる。`--path` は worktree の中での二次的な
絞り込みにしかならない。

## 設計

### 指摘の住所は 2 層

| 層 | 内容 |
|----|------|
| スコープ | コミット済みは `range:<base sha>..<target sha>` で worktree に依存しない。未コミット等は `uncommitted:<worktree>` で、その worktree にしか存在しない |
| アンカー | `file` + `side` + 行範囲 + 逐語引用 + 指摘時点の内容。現在の内容との対応付けで位置を導出する |

### 対象を追う方法

**現在の内容から引用を検索しない。** 指摘に応えて書き換えられた瞬間に位置を失う
——この機能がいちばん働くべき場面で失敗する。指摘した時点の内容を控えておき、
「基準版 → 対応付け → 現在」と辿る。

### 2 つの軸を混ぜない

「解決したか」（`status`）と「対象が動いたか」（`AnchorState`）は別の軸で持つ。
1 つにまとめると、書き換わった指摘が未解決の一覧から抜け落ちて黙って消える。

追えなくなった指摘は自動で付け替えたり閉じたりしない。似た行が複数あれば別の
場所へ飛ぶし、別の変更でたまたま対象行が消えただけの未対応の指摘が死ぬ。
事実を状態として出し、`resolve`（対応した）か `drop`（取り下げる）に委ねる。

### 保存先

```
~/.config/kodama/config.json                  プロジェクト登録・表示設定
~/.local/share/kodama/review/store.json       指摘（ユーザーが書いた成果物）
~/.local/state/kodama/viewed.json             閲覧済み（差分から作り直せる）
```

台帳の書き込みはロックを取ってから読み直す。GUI と CLI が同時に更新しても、
片方の書き込みが消えない。

## ライセンス

MIT
