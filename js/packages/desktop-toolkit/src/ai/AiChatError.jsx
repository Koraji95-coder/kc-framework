/**
 * Single-line error banner. Renders nothing when error is falsy.
 *
 * @param {object} props
 * @param {string|null} props.error
 * @param {string} [props.className]
 * @param {string} [props.prefix]
 */
export function AiChatError({
  error,
  className = "ch-chat-error",
  prefix = "error: ",
}) {
  if (!error) return null;
  return (
    <div className={className} role="alert">
      {prefix}
      {error}
    </div>
  );
}