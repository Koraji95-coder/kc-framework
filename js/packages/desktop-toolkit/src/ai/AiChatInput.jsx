import { useState } from "react";

/**
 * Single-line input + send / cancel button.
 *
 * Drives draft state internally if `value` + `onChange` aren't provided
 * (uncontrolled mode), or runs in controlled mode when they are. Submit
 * is wired so Enter sends and shift-Enter / multi-line support can be
 * layered on by the caller via the renderTextarea slot if needed.
 *
 * @param {object} props
 * @param {(content: string) => void} props.onSend
 * @param {() => void} [props.onCancel]
 * @param {boolean} [props.isStreaming]
 * @param {string} [props.value]
 * @param {(value: string) => void} [props.onChange]
 * @param {string} [props.placeholder]
 * @param {string} [props.className]
 * @param {string} [props.sendLabel]
 * @param {string} [props.cancelLabel]
 */
export function AiChatInput({
  onSend,
  onCancel,
  isStreaming = false,
  value,
  onChange,
  placeholder = "Ask anything...",
  className = "ch-chat-input-row",
  sendLabel = "send",
  cancelLabel = "cancel",
}) {
  const controlled = value !== undefined && onChange !== undefined;
  const [internalDraft, setInternalDraft] = useState("");
  const draft = controlled ? value : internalDraft;
  const setDraft = controlled ? onChange : setInternalDraft;

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    if (!controlled) setInternalDraft("");
  }

  return (
    <form className={className} onSubmit={handleSubmit}>
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
        <button
          type="button"
          className="ch-chat-send ch-chat-cancel"
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
      ) : (
        <button
          type="submit"
          className="ch-chat-send"
          disabled={!draft.trim()}
        >
          {sendLabel}
        </button>
      )}
    </form>
  );
}