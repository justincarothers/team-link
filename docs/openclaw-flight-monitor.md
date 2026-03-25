# OpenClaw + Codex + Flight Monitor

This repo now exposes a local flight monitor that OpenClaw can query:

- `GET /api/flights/summary`
- `GET /api/flights/routes`
- `GET /api/flights/history/:destination`
- `POST /api/flights/scan`

Recommended OpenClaw setup:

1. Enable ACP with `acpx`.
2. Add a persistent `codex` ACP agent.
3. Point the ACP agent `cwd` at this repo.
4. Have OpenClaw use the local monitor endpoints for flight context.

Official OpenClaw references:

- ACP agents: https://docs.openclaw.ai/tools/acp-agents
- ACP bridge CLI: https://docs.openclaw.ai/cli/acp
- OpenAI/Codex provider: https://docs.openclaw.ai/providers/openai
- Gateway configuration reference: https://docs.openclaw.ai/gateway/configuration-reference

Suggested operator prompts in OpenClaw:

- `Start a persistent Codex session in a thread here and monitor /api/flights/summary.`
- `Ask Codex to trigger POST /api/flights/scan and summarize new fire deals from PDX.`
- `Have Codex compare today's /api/flights/routes output against yesterday's history and only alert on real drops.`

Suggested Discord workflow:

1. Keep the server running locally.
2. Bind a Codex ACP thread in Discord.
3. Trigger `/api/flights/scan` on demand or let the server run its daily schedule.
4. Let OpenClaw summarize `/api/flights/summary` into the thread when alerts matter.
