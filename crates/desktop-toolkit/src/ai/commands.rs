use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, State};

use super::client::BrokerAiClient;
use super::types::{ChatMessage, LaneInfo};

/// Tauri-managed state: holds the broker client + a map of in-flight stream
/// cancellation flags keyed by requestId. Register once at app startup:
///
/// ```ignore
/// tauri::Builder::default()
///     .manage(desktop_toolkit::ai::AiState::new(broker_url, api_key))
///     .invoke_handler(tauri::generate_handler![
///         desktop_toolkit::ai::commands::ai_chat_stream,
///         desktop_toolkit::ai::commands::ai_list_lanes,
///         desktop_toolkit::ai::commands::ai_cancel_stream,
///     ])
/// ```
pub struct AiState {
    client: BrokerAiClient,
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AiState {
    pub fn new(broker_url: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            client: BrokerAiClient::new(broker_url, api_key),
            active: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Serialize)]
pub struct LaneSummary {
    pub identity: String,
    pub lanes: Vec<LaneInfo>,
}

#[tauri::command]
pub async fn ai_list_lanes(state: State<'_, AiState>) -> Result<LaneSummary, String> {
    state
        .client
        .list_lanes()
        .await
        .map(|r| LaneSummary { identity: r.identity, lanes: r.lanes })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_chat_stream(
    app: AppHandle,
    state: State<'_, AiState>,
    request_id: String,
    lane: String,
    messages: Vec<ChatMessage>,
    model_override: Option<String>,
) -> Result<(), String> {
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut active = state.active.lock().map_err(|e| e.to_string())?;
        active.insert(request_id.clone(), cancelled.clone());
    }

    let result = state
        .client
        .stream_chat(app, request_id.clone(), cancelled, lane, messages, model_override)
        .await
        .map_err(|e| e.to_string());

    // Always clear the entry, success or failure.
    if let Ok(mut active) = state.active.lock() {
        active.remove(&request_id);
    }
    result
}

#[tauri::command]
pub fn ai_cancel_stream(state: State<'_, AiState>, request_id: String) -> Result<bool, String> {
    let active = state.active.lock().map_err(|e| e.to_string())?;
    match active.get(&request_id) {
        Some(flag) => {
            flag.store(true, Ordering::Relaxed);
            Ok(true)
        }
        None => Ok(false),
    }
}