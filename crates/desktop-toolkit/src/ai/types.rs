use serde::{Deserialize, Serialize};

/// One message in a chat exchange. Mirrors the broker's wire format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user" | "assistant" | "system"
    pub content: String,
}

/// Body of POST /api/chat/stream.
#[derive(Debug, Serialize)]
pub struct ChatStreamRequest {
    pub lane: String,
    pub messages: Vec<ChatMessage>,
    #[serde(rename = "modelOverride", skip_serializing_if = "Option::is_none")]
    pub model_override: Option<String>,
}

/// One frame parsed from the NDJSON stream.
#[derive(Debug, Clone, Deserialize)]
pub struct ChatStreamFrame {
    #[serde(rename = "type")]
    pub frame_type: String, // "start" | "chunk" | "done" | "error"
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    pub lane: Option<String>,
    pub model: Option<String>,
    pub delta: Option<String>,
    pub message: Option<String>,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<i64>,
    #[serde(rename = "inputTokens")]
    pub input_tokens: Option<i32>,
    #[serde(rename = "outputTokens")]
    pub output_tokens: Option<i32>,
    #[serde(rename = "costUsd")]
    pub cost_usd: Option<f64>,
}

/// Response of GET /api/lanes.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LaneInfo {
    pub name: String,
    pub description: String,
    pub model: String,
    #[serde(rename = "allowModelOverride")]
    pub allow_model_override: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LanesResponse {
    pub identity: String,
    pub lanes: Vec<LaneInfo>,
}