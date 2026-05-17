import { useRef, useEffect, useState } from 'react';
import { useAIChat } from './useAIChat.js';
import './ChatPanel.css';

/**
 * Drop-in chat panel that streams from the Foundry broker on a specific lane.
 * Consumer apps customize the lane, model override, system prompt (set on the
 * broker side via lane profile), and styling via className.
 *
 * Layout: scrolling message list on top, single-line input + send button at
 * the bottom. Auto-scrolls to the newest message as deltas arrive. Empty
 * state shows a placeholder so the panel doesn't look broken before the
 * first turn.
 */
export function ChatPanel({
  lane,
  modelOverride,
  initialMessages,
  placeholder = 'Ask anything...',
  emptyState = 'Send a message to start the conversation.',
  className,
  onError,
}) {
  const { messages, send, cancel, isStreaming, error, meta } = useAIChat({
    lane,
    modelOverride,
    initialMessages,
  });

  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (error && onError) onError(error);
  }, [error, onError]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function onSubmit(event) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isStreaming) return;
    setDraft('');
    send(trimmed);
  }

  return (
    <div className={`ch-chat-panel ${className ?? ''}`.trim()}>
      <div className="ch-chat-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="ch-chat-empty">{emptyState}</div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`ch-chat-message ch-chat-message-${m.role}`}>
              <div className="ch-chat-role">{m.role}</div>
              <div className="ch-chat-content">{m.content}</div>
            </div>
          ))
        )}
      </div>

      {error && <div className="ch-chat-error">error: {error}</div>}

      {meta && (
        <div className="ch-chat-meta">
          {meta.lane} · {meta.model}
          {meta.inputTokens !== undefined && meta.outputTokens !== undefined && (
            <> · in:{meta.inputTokens} out:{meta.outputTokens}</>
          )}
          {typeof meta.costUsd === 'number' && meta.costUsd > 0 && (
            <> · ${meta.costUsd.toFixed(4)}</>
          )}
        </div>
      )}

      <form className="ch-chat-input-row" onSubmit={onSubmit}>
        <input
          type="text"
          className="ch-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          disabled={isStreaming}
          aria-label="Chat input"
        />
        {isStreaming ? (
          <button type="button" className="ch-chat-send ch-chat-cancel" onClick={cancel}>
            cancel
          </button>
        ) : (
          <button type="submit" className="ch-chat-send" disabled={!draft.trim()}>
            send
          </button>
        )}
      </form>
    </div>
  );
}

export default ChatPanel;