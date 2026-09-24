-- Migration 0009 (hardened.3): Claude Opus/Sonnet/Fable 5.x + current MiniMax models
-- IDs verified against Anthropic/OpenAI/MiniMax docs (Sep 2026).
WITH candidates(id, label, provider, upstream_model, reasoning_budget, service_tier, sort_offset) AS (
	VALUES
		-- Claude flagship (Sep 2026)
		('opus-5', 'Opus 5', 'claude', 'claude-opus-5', NULL, NULL, 1),
		('opus-5-low', 'Opus 5 Low', 'claude', 'claude-opus-5', 'low', NULL, 2),
		('opus-5-medium', 'Opus 5 Medium', 'claude', 'claude-opus-5', 'medium', NULL, 3),
		('opus-5-high', 'Opus 5 High', 'claude', 'claude-opus-5', 'high', NULL, 4),
		('opus-5-xhigh', 'Opus 5 XHigh', 'claude', 'claude-opus-5', 'xhigh', NULL, 5),
		('opus-5-max', 'Opus 5 Max', 'claude', 'claude-opus-5', 'max', NULL, 6),
		('sonnet-5', 'Sonnet 5', 'claude', 'claude-sonnet-5', NULL, NULL, 7),
		('sonnet-5-medium', 'Sonnet 5 Medium', 'claude', 'claude-sonnet-5', 'medium', NULL, 8),
		('sonnet-5-high', 'Sonnet 5 High', 'claude', 'claude-sonnet-5', 'high', NULL, 9),
		('fable-5.1', 'Fable 5.1', 'claude', 'claude-fable-5-1', NULL, NULL, 10),
		('fable-5.1-high', 'Fable 5.1 High', 'claude', 'claude-fable-5-1', 'high', NULL, 11),
		('fable-5.1-max', 'Fable 5.1 Max', 'claude', 'claude-fable-5-1', 'max', NULL, 12),
		('haiku-4.5-alias', 'Haiku 4.5 (alias)', 'claude', 'claude-haiku-4-5', NULL, NULL, 13),
		-- MiniMax (never seeded before; README only mentioned M2.7)
		('minimax-m3', 'MiniMax M3', 'minimax', 'MiniMax-M3', NULL, NULL, 14),
		('minimax-m2.7', 'MiniMax M2.7', 'minimax', 'MiniMax-M2.7', NULL, NULL, 15),
		('minimax-m2.7-highspeed', 'MiniMax M2.7 Highspeed', 'minimax', 'MiniMax-M2.7-highspeed', NULL, NULL, 16),
		('minimax-m2.5', 'MiniMax M2.5', 'minimax', 'MiniMax-M2.5', NULL, NULL, 17),
		('minimax-m2.5-highspeed', 'MiniMax M2.5 Highspeed', 'minimax', 'MiniMax-M2.5-highspeed', NULL, NULL, 18),
		('minimax-m2.1', 'MiniMax M2.1', 'minimax', 'MiniMax-M2.1', NULL, NULL, 19),
		('minimax-m2', 'MiniMax M2', 'minimax', 'MiniMax-M2', NULL, NULL, 20)
),
base_sort_order(value) AS (
	SELECT COALESCE(MAX(sort_order), -1)
	FROM model_mappings
),
resolved_candidates AS (
	SELECT
		candidate.id,
		candidate.label,
		candidate.provider,
		candidate.upstream_model,
		(SELECT value FROM base_sort_order) + candidate.sort_offset AS sort_order,
		candidate.reasoning_budget,
		candidate.service_tier
	FROM candidates AS candidate
)
INSERT OR IGNORE INTO model_mappings (id, label, provider, upstream_model, sort_order, reasoning_budget, service_tier)
SELECT candidate.id, candidate.label, candidate.provider, candidate.upstream_model, candidate.sort_order, candidate.reasoning_budget, candidate.service_tier
FROM resolved_candidates AS candidate
WHERE NOT EXISTS (
	SELECT 1
	FROM model_mappings AS existing
	WHERE existing.provider = candidate.provider
		AND existing.upstream_model = candidate.upstream_model
		AND (
			existing.reasoning_budget = candidate.reasoning_budget
			OR (existing.reasoning_budget IS NULL AND candidate.reasoning_budget IS NULL)
		)
		AND (
			existing.service_tier = candidate.service_tier
			OR (existing.service_tier IS NULL AND candidate.service_tier IS NULL)
			OR (existing.service_tier IS NULL AND candidate.service_tier = 'default')
		)
);
