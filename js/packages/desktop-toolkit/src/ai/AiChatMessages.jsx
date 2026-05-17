import { useEffect, useRef } from "react";

/**
 * Scrolling message list with auto-scroll-to-bottom on new content.
 *
 * The slot-based building block under <AiChatShell>. Apps that want a
 * fully custom layout can use this directly, or pass a custom
 * renderMessage to override per-message rendering while keeping the
 * scroll behavior.
 *
 * @param {object} props
 * @param {Array<{role: string, content: string}>} props.messages
 * @param {(message: object, index: number) => React.ReactNode} [props.renderMessage]
 *   Per-message renderer. Defaults to a minimal role + content layout.
 * @param {React.ReactNode} [props.emptyState]
 *   Rendered when messages is empty. Defaults to null (caller fills in).
 * @param {string} [props.className]
 */
export function AiChatMessages({
  messages,
  renderMessage = defaultRenderMessage,
  emptyState = null,
  className = "ch-chat-messages",
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div ref={scrollRef} className={className}>
        {emptyState}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className={className}>
      {messages.map((m, i) => renderMessage(m, i))}
    </div>
  );
}

function defaultRenderMessage(message, index) {
  return (
    <div
      key={index}
      className={`ch-chat-message ch-chat-message-${message.role}`}
    >
      <div className="ch-chat-role">{message.role}</div>
      <div className="ch-chat-content">{message.content}</div>
    </div>
  );
}