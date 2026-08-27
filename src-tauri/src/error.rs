//! フロントへ返せる（Serialize 可能な）エラー型。

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct KdError {
    pub message: String,
}

impl KdError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for KdError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for KdError {}

impl From<std::io::Error> for KdError {
    fn from(e: std::io::Error) -> Self {
        KdError::new(e.to_string())
    }
}

impl From<serde_json::Error> for KdError {
    fn from(e: serde_json::Error) -> Self {
        KdError::new(e.to_string())
    }
}

pub type KdResult<T> = Result<T, KdError>;
