# Ungate 1.7.12-hardened.3

Sideload-only hardening fork for Alexander. Not pushed upstream.

## Security (from .1 / .2)

1. API binds `127.0.0.1` only.
2. Fail-closed Bearer / `x-api-key` auth (401). OPTIONS preflight allowed for CORS.
3. Public: `/health`, `/auth/openai/callback`, OPTIONS.
4. Dashboard key via extension injection (`~/.ungate/proxy-api-key` → `__API_KEY__`).
5. Strong proxy key: `randomBytes(32).toString('base64url')`.
6. Webview API base `http://127.0.0.1:<port>` (not `localhost` / `::1`).

## Models (.3)

Seeded via drizzle `_0008` + `_0009` (INSERT OR IGNORE — preserves user custom rows):

**OpenAI / Codex:** GPT-6 Astra (`gpt-6-astra`) as `ungate-astra-*` Cursor-safe IDs (medium/high/xhigh/max + priority/fast variants). Keeps existing GPT-5.6 Sol/Terra/Luna.

**Claude:** Opus 5, Sonnet 5, Fable 5.1 (+ reasoning tiers). Keeps Opus/Sonnet 4.x and Haiku 4.5 from earlier migrations.

**MiniMax:** M3, M2.7 (+ highspeed), M2.5 (+ highspeed), M2.1, M2 — first time seeded into DB (previously README-only).

IDs taken from Anthropic / OpenAI / MiniMax docs (Sep 2026) and upstream `feat/gpt-6-astra`.

## Install

Uninstall previous hardened build → Install from VSIX → reload. Existing DBs pick up new models on API start (migration). Copy new model IDs into Cursor custom models.
