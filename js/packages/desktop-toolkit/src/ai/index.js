export { useAIChat } from "./useAIChat.js";
export { useLanes } from "./useLanes.js";

// Easy-mode drop-in (back-compat from earlier toolkit versions).
export { ChatPanel } from "./ChatPanel.jsx";

// Composable shell + building blocks. Pick one of these paths:
//   1. <AiChatShell lane=... renderMessage={...} renderInput={...} />
//      -- the shell wires useAIChat internally and exposes named slots.
//   2. const session = useAIChat({ lane })
//      then compose <AiChatMessages>, <AiChatInput>, <AiChatMeta>,
//      <AiChatError> manually for full layout control.
export { AiChatShell } from "./AiChatShell.jsx";
export { AiChatMessages } from "./AiChatMessages.jsx";
export { AiChatInput } from "./AiChatInput.jsx";
export { AiChatMeta } from "./AiChatMeta.jsx";
export { AiChatError } from "./AiChatError.jsx";