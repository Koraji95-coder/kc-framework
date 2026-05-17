import { AiChatShell } from "./AiChatShell.jsx";
import "./ChatPanel.css";

/**
 * Drop-in chat panel -- the easy-mode wrapper.
 *
 * Backed by <AiChatShell> with the original ChatPanel.css for styling.
 * Apps that want a more customized look should consume <AiChatShell>
 * (or the lower-level useAIChat hook + sub-components) directly.
 *
 * This component is preserved for back-compat: any consumer importing
 * <ChatPanel> from previous toolkit versions continues to work
 * unchanged.
 */
export function ChatPanel({
  lane,
  modelOverride,
  initialMessages,
  placeholder = "Ask anything...",
  emptyState = "Send a message to start the conversation.",
  className,
  onError,
}) {
  return (
    <AiChatShell
      lane={lane}
      modelOverride={modelOverride}
      initialMessages={initialMessages}
      placeholder={placeholder}
      emptyState={emptyState}
      className={className}
      onError={onError}
    />
  );
}

export default ChatPanel;