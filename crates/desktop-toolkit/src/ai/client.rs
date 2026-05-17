use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use reqwest::Client;
use tauri::{AppHandle, Emitter};

use super::types::{ChatMessage, ChatStreamFrame, ChatStreamRequest, LanesResponse};

/// HTTP client for the Foundry broker. Holds the resolved broker URL and the
/// caller's API key; one instance per Tauri app, registered as managed state.
pub struct BrokerAiClient {
    base_url: String,
    api_key: String,
    http: Client,
}

impl BrokerAiClient {
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
            http: Client::builder()
                .timeout(std::time::Duration::from_secs(600)) // 10 min total ceiling
                .read_timeout(std::time::Duration::from_secs(30)) // idle-read cap (per chunk)
                .build()
                .expect("reqwest client construction is infallible with default config"),
        }
    }

    pub async fn list_lanes(&self) -> Result<LanesResponse, BrokerError> {
        let url = format!("{}/api/lanes", self.base_url);
        let res = self
            .http
            .get(&url)
            .header("X-Foundry-Api-Key", &self.api_key)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(BrokerError::Transport)?;

        if !res.status().is_success() {
            let status = res.status().as_u16();
            let body = res.text().await.unwrap_or_default();
            return Err(BrokerError::Status { status, body });
        }

        res.json::<LanesResponse>()
            .await
            .map_err(BrokerError::Transport)
    }

    /// Streams a chat completion from the broker over NDJSON, emitting one
    /// Tauri event per parsed frame. Returns when the stream completes,
    /// errors, or is cancelled via the supplied flag.
    ///
    /// Event names:
    /// - `ai-chat-start`  payload: { requestId, sessionId, lane, model }
    /// - `ai-chat-chunk`  payload: { requestId, delta }
    /// - `ai-chat-done`   payload: { requestId, durationMs }
    /// - `ai-chat-error`  payload: { requestId, message }
    pub async fn stream_chat(
        &self,
        app: AppHandle,
        request_id: String,
        cancelled: Arc<AtomicBool>,
        lane: String,
        messages: Vec<ChatMessage>,
        model_override: Option<String>,
    ) -> Result<(), BrokerError> {
        let url = format!("{}/api/chat/stream", self.base_url);
        let body = ChatStreamRequest {
            lane,
            messages,
            model_override,
        };

        let res = self
            .http
            .post(&url)
            .header("X-Foundry-Api-Key", &self.api_key)
            .header("Accept", "application/x-ndjson")
            .json(&body)
            .send()
            .await
            .map_err(BrokerError::Transport)?;

        if !res.status().is_success() {
            // Pre-stream failure (auth, lane allow-list, etc.). Surface only
            // via the Result; the JS hook's catch handles UI rollback.
            // Emitting an event here would cause double-handling and leave a
            // ghost assistant turn in the chat history.
            let status = res.status().as_u16();
            let text = res.text().await.unwrap_or_default();
            return Err(BrokerError::Status { status, body: text });
        }

        let mut response = res;
        let mut buffer = String::new();

        // Pull bytes until the server closes or we're cancelled. Each NDJSON
        // line is one frame; lines may straddle chunk boundaries so we
        // accumulate into a buffer and split on newlines. We poll with an
        // idle timeout so a stalled connection doesn't pin the task past
        // cancel.
        // Pull bytes until the server closes or we're cancelled. The reqwest
        // Client is configured with read_timeout(30s), so a stalled connection
        // surfaces as a transport Err rather than blocking forever — that
        // lets us bound how long a cancelled stream pins the task.
        const MAX_BUFFER_BYTES: usize = 1_048_576;
        loop {
            if cancelled.load(Ordering::Relaxed) {
                return Ok(());
            }

            match response.chunk().await {
                Ok(Some(bytes)) => {
                    buffer.push_str(&String::from_utf8_lossy(&bytes));
                    if buffer.len() > MAX_BUFFER_BYTES {
                        emit_error(
                            &app,
                            &request_id,
                            "stream buffer exceeded 1 MiB without a frame boundary",
                        );
                        return Err(BrokerError::Status {
                            status: 0,
                            body: "buffer overflow".into(),
                        });
                    }
                    while let Some(nl) = buffer.find('\n') {
                        let line: String = buffer.drain(..=nl).collect();
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }
                        forward_frame(&app, &request_id, trimmed);
                    }
                }
                Ok(None) => {
                    let tail = buffer.trim();
                    if !tail.is_empty() {
                        forward_frame(&app, &request_id, tail);
                    }
                    return Ok(());
                }
                Err(err) => {
                    // If we were cancelled and the error is a read timeout
                    // firing because of it, treat as a clean cancel.
                    if cancelled.load(Ordering::Relaxed) {
                        return Ok(());
                    }
                    emit_error(&app, &request_id, &format!("Transport error: {}", err));
                    return Err(BrokerError::Transport(err));
                }
            }
        }
    }
}

fn forward_frame(app: &AppHandle, request_id: &str, line: &str) {
    let frame: ChatStreamFrame = match serde_json::from_str(line) {
        Ok(f) => f,
        Err(_) => {
            // Non-JSON line — ignore (broker shouldn't emit any, but be robust).
            return;
        }
    };

    let payload = serde_json::json!({
        "requestId": request_id,
        "sessionId": frame.session_id,
        "lane": frame.lane,
        "model": frame.model,
        "delta": frame.delta,
        "message": frame.message,
        "durationMs": frame.duration_ms,
        "inputTokens": frame.input_tokens,
        "outputTokens": frame.output_tokens,
        "costUsd": frame.cost_usd,
    });

    let event = match frame.frame_type.as_str() {
        "start" => "ai-chat-start",
        "chunk" => "ai-chat-chunk",
        "done" => "ai-chat-done",
        "error" => "ai-chat-error",
        _ => return,
    };
    let _ = app.emit(event, payload);
}

fn emit_error(app: &AppHandle, request_id: &str, message: &str) {
    let _ = app.emit(
        "ai-chat-error",
        serde_json::json!({
            "requestId": request_id,
            "message": message,
        }),
    );
}

#[derive(Debug, thiserror::Error)]
pub enum BrokerError {
    #[error("transport error: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("broker returned {status}: {body}")]
    Status { status: u16, body: String },
}
