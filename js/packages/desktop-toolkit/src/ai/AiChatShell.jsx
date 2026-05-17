import { AiChatMessages } from "./AiChatMessages.jsx";
import { AiChatInput } from "./AiChatInput.jsx";
import { AiChatMeta } from "./AiChatMeta.jsx";
import { AiChatError } from "./AiChatError.jsx";
import { useAIChat } from "./useAIChat.js";

/**
 * Composable shell for AI chat. Handles the streaming + state wiring
 * internally via useAIChat, then exposes named render slots so consumer
 * apps can fully customize appearance without rewriting the boring
 * parts (scroll, NDJSON parse, request lifecycle, cancel).
 *
 * Defaults mirror the original <ChatPanel> layout so adopting the shell
 * for an existing consumer is a no-op upgrade. Each slot can be
 * overridden in isolation -- e.g., pass renderMessage to change message
 * bubble appearance while keeping the input area as-is.
 *
 * Slots (all optional):
 *   renderHeader(ctx)      -- top chrome; default: null
 *   renderMessage(msg, i)  -- per-message body; default: minimal role + content
 *   renderEmpty()          -- shown when messages.length === 0
 *   renderMeta(meta)       -- token / lane line; default: <AiChatMeta>
 *   renderError(error)     -- error banner; default: <AiChatError>
 *   renderInput(ctx)       -- input area; default: <AiChatInput>
 *
 * The `ctx` passed to renderHeader and renderInput is:
 *   { messages, isStreaming, error, meta, send, cancel, clear }
 *
 * Apps that want full custom layout should call useAIChat themselves
 * and compose <AiChatMessages>, <AiChatInput>, <AiChatMeta>, <AiChatError>
 * directly -- the shell is just the convenient composition.
 *
 * @param {object} props
 * @param {string} props.lane - Foundry lane name (required).
 * @param {string} [props.modelOverride]
 * @param {Array<{role: string, content: string}>} [props.initialMessages]
 * @param {string} [props.placeholder]
 * @param {React.ReactNode} [props.emptyState]
 *   Used by the default renderEmpty when no override is provided.
 * @param {string} [props.className]
 * @param {(error: string) => void} [props.onError]
 *
 * @param {(ctx: object) => React.ReactNode} [props.renderHeader]
 * @param {(message: object, index: number) => React.ReactNode} [props.renderMessage]
 * @param {() => React.ReactNode} [props.renderEmpty]
 * @param {(meta: object|null) => React.ReactNode} [props.renderMeta]
 * @param {(error: string|null) => React.ReactNode} [props.renderError]
 * @param {(ctx: object) => React.ReactNode} [props.renderInput]
 */
export function AiChatShell({
  lane,
  modelOverride,
  initialMessages,
  placeholder = "Ask anything...",
  emptyState = "Send a message to start the conversation.",
  className,
  onError,

  renderHeader = null,
  renderMessage,
  renderEmpty,
  renderMeta,
  renderError,
  renderInput,
}) {
  const session = useAIChat({ lane, modelOverride, initialMessages });
  const { messages, send, cancel, isStreaming, error, meta, clear } = session;

  // Surface error to caller, then let renderError / default banner show it.
  if (onError && error) onError(error);

  const ctx = { messages, isStreaming, error, meta, send, cancel, clear };

  const header = renderHeader ? renderHeader(ctx) : null;

  const empty = renderEmpty
    ? renderEmpty()
    : (
      <div className="ch-chat-empty">{emptyState}</div>
    );

  const metaNode = renderMeta ? renderMeta(meta) : <AiChatMeta meta={meta} />;
  const errorNode = renderError ? renderError(error) : <AiChatError error={error} />;
  const inputNode = renderInput ? renderInput(ctx) : (
    <AiChatInput
      onSend={send}
      onCancel={cancel}
      isStreaming={isStreaming}
      placeholder={placeholder}
    />
  );

  return (
    <div className={`ch-chat-panel ${className ?? ""}`.trim()}>
      {header}
      <AiChatMessages
        messages={messages}
        renderMessage={renderMessage}
        emptyState={empty}
      />
      {errorNode}
      {metaNode}
      {inputNode}
    </div>
  );
}