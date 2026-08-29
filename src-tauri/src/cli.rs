//! CLI としての振る舞い。
//!
//! GUI が起動していなくても指摘を読み書きできるよう、台帳を直接触る。
//! GUI への IPC は経由しない。

use clap::{Parser, Subcommand, ValueEnum};

use crate::error::KdResult;
use crate::review::{self, format, model::Status};

#[derive(Parser)]
#[command(
    name = "kodama",
    about = "worktree 対応の diff レビュー。review サブコマンドで指摘を読み書きする"
)]
pub struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// レビューの指摘を扱う
    Review {
        #[command(subcommand)]
        action: ReviewAction,
    },
}

#[derive(Subcommand)]
enum ReviewAction {
    /// 指摘を一覧する
    List {
        /// この worktree の指摘に絞る。省略時は現在地から解決する
        #[arg(long)]
        worktree: Option<String>,
        /// この比較対象の指摘に絞る（`range:<base>..<target>` 等）
        #[arg(long)]
        commit: Option<String>,
        /// リポジトリ相対パスの前方一致。worktree の中での二次的な絞り込み
        #[arg(long)]
        path: Option<String>,
        /// 既定は未解決のみ。未解決には対象が書き換わったものも含む
        #[arg(long, value_enum, default_value_t = StatusFilter::Open)]
        status: StatusFilter,
        #[arg(long, value_enum, default_value_t = OutputFormat::Md)]
        format: OutputFormat,
    },
    /// 指摘を 1 件表示する
    Show {
        thread: String,
        #[arg(long, value_enum, default_value_t = OutputFormat::Md)]
        format: OutputFormat,
    },
    /// 指摘に返信する
    Reply {
        thread: String,
        #[arg(long)]
        body: String,
        #[arg(long, default_value = "AI")]
        author: String,
    },
    /// 対応したので解決済みにする
    Resolve {
        thread: String,
        #[arg(long, default_value = "AI")]
        by: String,
    },
    /// 解決済みを未解決に戻す
    Reopen { thread: String },
    /// 対象が消えたので取り下げる
    Drop {
        thread: String,
        #[arg(long, default_value = "AI")]
        by: String,
    },
}

#[derive(Clone, Copy, ValueEnum)]
enum StatusFilter {
    /// 未解決のみ
    Open,
    /// 解決済み・取り下げも含める
    All,
}

#[derive(Clone, Copy, ValueEnum)]
enum OutputFormat {
    Md,
    Json,
}

pub fn run() -> KdResult<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Review { action } => run_review(action),
    }
}

fn run_review(action: ReviewAction) -> KdResult<()> {
    match action {
        ReviewAction::List {
            worktree,
            commit,
            path,
            status,
            format: fmt,
        } => {
            let views = review::list(&review::Filter {
                repo: Some(worktree.unwrap_or_else(current_worktree)),
                revision_key: commit,
                path_prefix: path,
                include_closed: matches!(status, StatusFilter::All),
            })?;
            println!("{}", render(&views, fmt)?);
        }

        ReviewAction::Show { thread, format: fmt } => {
            let view = review::get(&thread)?;
            println!("{}", render(std::slice::from_ref(&view), fmt)?);
        }

        ReviewAction::Reply {
            thread,
            body,
            author,
        } => {
            review::reply(&thread, &author, &body)?;
            println!("返信しました: #{thread}");
        }

        ReviewAction::Resolve { thread, by } => {
            review::set_status(
                &thread,
                Status::Resolved {
                    by: by.clone(),
                    at: crate::domain::ids::now_millis(),
                },
            )?;
            println!("解決済みにしました: #{thread}");
        }

        ReviewAction::Reopen { thread } => {
            review::set_status(&thread, Status::Open)?;
            println!("未解決に戻しました: #{thread}");
        }

        ReviewAction::Drop { thread, by } => {
            review::set_status(
                &thread,
                Status::Dropped {
                    by: by.clone(),
                    at: crate::domain::ids::now_millis(),
                },
            )?;
            println!("取り下げました: #{thread}");
        }
    }
    Ok(())
}

fn render(views: &[review::model::ThreadView], fmt: OutputFormat) -> KdResult<String> {
    Ok(match fmt {
        OutputFormat::Md => format::threads_markdown(views),
        OutputFormat::Json => serde_json::to_string_pretty(views)?,
    })
}

/// 現在地が属する worktree。git が無ければカレントをそのまま使う。
fn current_worktree() -> String {
    crate::infra::shell::capture(
        &["git", "rev-parse", "--show-toplevel"],
        None,
        false,
    )
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string())
    })
}
