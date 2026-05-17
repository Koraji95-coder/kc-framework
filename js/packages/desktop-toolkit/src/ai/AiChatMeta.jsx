/**
 * One-line meta display: lane · model · in:N out:N · $X.XXXX.
 *
 * Pass meta straight from useAIChat. Renders nothing when meta is null
 * or empty, so callers can mount it unconditionally.
 *
 * @param {object} props
 * @param {object|null} props.meta
 * @param {string} [props.className]
 */
export function AiChatMeta({ meta, className = "ch-chat-meta" }) {
  if (!meta) return null;
  const { lane, model, inputTokens, outputTokens, costUsd } = meta;
  const hasTokens = inputTokens !== undefined && outputTokens !== undefined;
  const hasCost = typeof costUsd === "number" && costUsd > 0;
  return (
    <div className={className}>
      {lane}
      {model && (
        <>
          {" "}
          · {model}
        </>
      )}
      {hasTokens && (
        <>
          {" "}
          · in:{inputTokens} out:{outputTokens}
        </>
      )}
      {hasCost && (
        <>
          {" "}
          · ${costUsd.toFixed(4)}
        </>
      )}
    </div>
  );
}