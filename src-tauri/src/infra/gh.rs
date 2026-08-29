//! GitHub CLI のアダプタ。
//!
//! PR の状態は worktree を選ぶときの重要な手がかりになる（下書きなのか、
//! すでにマージ済みなのか）。`gh` が無い・未認証の環境でも動くよう、
//! 失敗は「PR 情報が無い」として扱い、エラーにはしない。

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::infra::shell::capture;

/// 一度に引く PR の上限。worktree の数を大きく超える件数は要らない。
const LIMIT: &str = "100";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PrState {
    Draft,
    Open,
    Merged,
    Closed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrInfo {
    pub number: i64,
    pub title: String,
    pub state: PrState,
    pub url: String,
}

#[derive(Deserialize)]
struct RawPr {
    number: i64,
    title: String,
    state: String,
    #[serde(rename = "isDraft")]
    is_draft: bool,
    #[serde(rename = "headRefName")]
    head_ref_name: String,
    url: String,
}

/// ブランチ名 → PR。取得できなければ空を返す。
pub fn pull_requests(repo: &str) -> HashMap<String, PrInfo> {
    let out = capture(
        &[
            "gh",
            "pr",
            "list",
            "--state",
            "all",
            "--limit",
            LIMIT,
            "--json",
            "number,title,state,isDraft,headRefName,url",
        ],
        Some(repo),
        false,
    )
    .unwrap_or_default();

    let Ok(raws) = serde_json::from_str::<Vec<RawPr>>(out.trim()) else {
        return HashMap::new();
    };

    let mut map: HashMap<String, PrInfo> = HashMap::new();
    for raw in raws {
        let state = if raw.is_draft && raw.state == "OPEN" {
            PrState::Draft
        } else {
            match raw.state.as_str() {
                "MERGED" => PrState::Merged,
                "CLOSED" => PrState::Closed,
                _ => PrState::Open,
            }
        };
        let info = PrInfo {
            number: raw.number,
            title: raw.title,
            state,
            url: raw.url,
        };
        // 同じブランチに複数あるときは新しい方（番号が大きい方）を残す。
        map.entry(raw.head_ref_name)
            .and_modify(|cur| {
                if info.number > cur.number {
                    *cur = info.clone();
                }
            })
            .or_insert(info);
    }
    map
}
