use std::collections::HashMap;

use crate::app::viewed::{self, ViewedState};
use crate::commands::run_query;
use crate::error::KdResult;

#[tauri::command]
pub async fn list_viewed(
    revision_key: String,
    current: HashMap<String, String>,
) -> KdResult<Vec<ViewedState>> {
    run_query(move || Ok(viewed::list(&revision_key, &current))).await
}

#[tauri::command]
pub async fn set_viewed(
    revision_key: String,
    file: String,
    diff_hash: String,
    viewed_flag: bool,
) -> KdResult<()> {
    run_query(move || viewed::set(&revision_key, &file, &diff_hash, viewed_flag)).await
}

#[tauri::command]
pub async fn clear_viewed(revision_key: String) -> KdResult<()> {
    run_query(move || viewed::clear(&revision_key)).await
}
