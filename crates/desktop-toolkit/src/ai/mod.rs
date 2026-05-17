//! AI chat module — Tauri bridge to the Foundry broker's lane-scoped chat API.
//!
//! Consumers register one `AiState` at startup and expose the three commands
//! via `tauri::generate_handler!`. The JS-side `useAIChat()` hook in
//! `@chamber-19/desktop-toolkit/ai` consumes the emitted events.
//!
//! Events emitted (payloads carry a `requestId` field for multiplexing):
//! - `ai-chat-start`  — stream opened: { requestId, sessionId, lane, model }
//! - `ai-chat-chunk`  — content delta: { requestId, delta }
//! - `ai-chat-done`   — stream finished: { requestId, durationMs }
//! - `ai-chat-error`  — provider/transport error: { requestId, message }

pub mod client;
pub mod commands;
pub mod types;

pub use client::{BrokerAiClient, BrokerError};
pub use commands::AiState;
pub use types::{ChatMessage, ChatStreamFrame, LaneInfo};