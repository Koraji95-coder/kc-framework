# AGENTS.md

See [`.github/copilot-instructions.md`](.github/copilot-instructions.md) for guidance applicable to all agents (Copilot, Claude Code, Aider, etc.).

For family-wide Chamber 19 rules, see [chamber-19/.github](https://github.com/chamber-19/.github).

## Current release: v2.7.0

Feature surface as of v2.7.0:

- **Activation + bearer auth** — `<ActivationGate>`, `useActivation`, `toolkit_activate_with_pin` Tauri command, `toolkit_get_bearer_token` Tauri command, `toolkit_bearer_dep` FastAPI dependency, `withToolkitBearer` JS fetch wrapper
- **AI shell** — `<AiChatShell>` with composable slots; standalone components: `<AiChatMessages>`, `<AiChatInput>`, `<AiChatMeta>`, `<AiChatError>`; `useAIChat`, `useLanes` hooks; `<ChatPanel>` is now a thin wrapper around the shell
- **Foundry dashboard** — `<DashboardOverview>` component and `useFoundryDashboard()` hook; imported from `./dashboard`; standalone dev preview at `preview/dashboard/`
- **Rust helpers** — `splash::emit_status_step`, `splash::transition_to_main_window`, `sidecar::spawn_python_dev_backend`, `sidecar::handle_window_destroyed`
