import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * React hook for streaming chat through the Foundry broker.
 *
 * Each call to `send(content)` opens a new stream with a fresh requestId,
 * appends the user turn to `messages`, then accumulates assistant deltas
 * into a single assistant message that grows as chunks arrive.
 *
 * @param {object} options
 * @param {string} options.lane - Foundry lane name (must be in the API key's allowlist).
 * @param {string} [options.modelOverride] - Only honored if the lane allows it.
 * @param {Array<{role: string, content: string}>} [options.initialMessages] - Seed messages (e.g. for resuming).
 * @returns {{
 *   messages: Array<{role: string, content: string}>,
 *   send: (content: string) => Promise<void>,
 *   cancel: () => Promise<void>,
 *   isStreaming: boolean,
 *   error: string | null,
 *   meta: { lane?: string, model?: string, sessionId?: string, durationMs?: number, inputTokens?: number, outputTokens?: number, costUsd?: number } | null,
 *   clear: () => void,
 * }}
 */
export function useAIChat({ lane, modelOverride, initialMessages = [] } = {}) {
  const [messages, setMessages] = useState(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);

  const activeRequestRef = useRef(null);
  const unlistenRef = useRef([]);

  useEffect(() => {
    let cancelled = false;

    async function wire() {
      const handlers = await Promise.all([
        listen('ai-chat-start', (e) => {
          if (e.payload?.requestId !== activeRequestRef.current) return;
          setMeta({
            lane: e.payload.lane,
            model: e.payload.model,
            sessionId: e.payload.sessionId,
          });
        }),
        listen('ai-chat-chunk', (e) => {
          if (e.payload?.requestId !== activeRequestRef.current) return;
          const delta = e.payload.delta ?? '';
          if (!delta) return;
          setMessages((prev) => appendDelta(prev, delta));
        }),
        listen('ai-chat-done', (e) => {
          if (e.payload?.requestId !== activeRequestRef.current) return;
          setIsStreaming(false);
          activeRequestRef.current = null;
          // Enrich meta with the final usage stats so consumers can render
          // per-message token counts / cost without a second round-trip.
          setMeta((prev) => ({
            ...(prev ?? {}),
            durationMs: e.payload.durationMs,
            inputTokens: e.payload.inputTokens,
            outputTokens: e.payload.outputTokens,
            costUsd: e.payload.costUsd,
          }));
        }),
        listen('ai-chat-error', (e) => {
          if (e.payload?.requestId !== activeRequestRef.current) return;
          setError(e.payload.message ?? 'unknown error');
          setIsStreaming(false);
          activeRequestRef.current = null;
        }),
      ]);
      if (cancelled) {
        handlers.forEach((un) => un());
      } else {
        unlistenRef.current = handlers;
      }
    }

    wire();

    return () => {
      cancelled = true;
      unlistenRef.current.forEach((un) => un && un());
      unlistenRef.current = [];
    };
  }, []);

  const send = useCallback(
    async (content) => {
      if (!lane) {
        setError('useAIChat: lane is required');
        return;
      }
      if (isStreaming) {
        setError('a stream is already in progress; call cancel() first');
        return;
      }

      setError(null);
      const requestId = crypto.randomUUID();
      activeRequestRef.current = requestId;
      setIsStreaming(true);

      // Append the user turn, then open an empty assistant turn that chunks
      // will accumulate into.
      const userTurn = { role: 'user', content };
      const assistantTurn = { role: 'assistant', content: '' };
      const turnsToSend = [...messages, userTurn];
      setMessages([...turnsToSend, assistantTurn]);

      try {
        await invoke('ai_chat_stream', {
          requestId,
          lane,
          messages: turnsToSend,
          modelOverride: modelOverride ?? null,
        });
      } catch (err) {
        setError(typeof err === 'string' ? err : err?.message ?? String(err));
        setIsStreaming(false);
        activeRequestRef.current = null;
        // Roll back: drop the empty assistant placeholder AND the user turn we
        // optimistically appended. Without this, a failed request leaves a
        // ghost empty bubble and an orphaned user message.
        setMessages((prev) => {
          if (prev.length >= 2 && prev[prev.length - 1].role === 'assistant' && prev[prev.length - 1].content === '') {
            return prev.slice(0, -2);
          }
          return prev;
        });
      }
    },
    [lane, modelOverride, messages, isStreaming],
  );

  const cancel = useCallback(async () => {
    const requestId = activeRequestRef.current;
    if (!requestId) return;
    // Clear the active ref synchronously so any send() that races this call
    // installs its new requestId AFTER this clear (not before, which would
    // cause cancel() to wipe the new request's filter).
    activeRequestRef.current = null;
    setIsStreaming(false);
    try {
      await invoke('ai_cancel_stream', { requestId });
    } catch {
      // Cancellation is best-effort; ignore command errors.
    }
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setMeta(null);
    setError(null);
  }, []);

  return { messages, send, cancel, isStreaming, error, meta, clear };
}

function appendDelta(messages, delta) {
  if (messages.length === 0) {
    return [{ role: 'assistant', content: delta }];
  }
  const last = messages[messages.length - 1];
  if (last.role !== 'assistant') {
    return [...messages, { role: 'assistant', content: delta }];
  }
  const updated = { ...last, content: last.content + delta };
  return [...messages.slice(0, -1), updated];
}