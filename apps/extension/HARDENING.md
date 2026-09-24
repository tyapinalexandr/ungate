# Ungate 1.7.12-hardened.4

Sideload-only hardening fork for Alexander (`tyapinalexandr/ungate`).

## Security (from .1 / .2)

1. API binds `127.0.0.1` only.
2. Fail-closed Bearer / `x-api-key` auth (401). OPTIONS preflight allowed for CORS.
3. Public: `/health`, `/auth/openai/callback`, OPTIONS.
4. Dashboard key via extension injection (`~/.ungate/proxy-api-key` → `__API_KEY__`).
5. Strong proxy key: `randomBytes(32).toString('base64url')`.
6. Webview API base `http://127.0.0.1:<port>` (not `localhost` / `::1`).

## Models (.4)

Migration `_0010` refreshes the active catalog and deletes superseded rows from existing DBs.

**OpenAI / Codex:** GPT-6 Astra, GPT-6 Sol, GPT-6 Luna (`ungate-*-*` Cursor-safe IDs). Terra remains `gpt-5.6-terra` (OpenAI has no gpt-6-terra). Removed GPT-5.6 Sol/Luna.

**Claude:** Opus 5.5, Sonnet 5, Fable 5.1, Haiku 4.5. Removed Opus 5 and all 4.x/3.x seeds.

**MiniMax:** M3 only.

IDs from OpenAI / Anthropic docs (2026-09-24).

## Install

Uninstall previous hardened build → Install from VSIX → reload. Existing DBs migrate on API start. Copy new model IDs into Cursor custom models.
