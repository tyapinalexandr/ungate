-- Migration 0010 (hardened.4): freshest OpenAI GPT-6 + Claude 5.5 catalog
-- Verified IDs (2026-09-24): gpt-6-astra/sol/luna, gpt-5.6-terra (no gpt-6-terra),
-- claude-opus-5-5, claude-fable-5-1, claude-sonnet-5, claude-haiku-4-5, MiniMax-M3.

-- Remove superseded OpenAI (Sol/Luna moved to GPT-6; keep Terra on 5.6)
DELETE FROM model_mappings
WHERE provider = 'openai'
	AND upstream_model IN ('gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.6');
--> statement-breakpoint

-- Remove superseded Claude (Opus 5 → 5.5; drop 4.x / 3.x / Fable 5)
DELETE FROM model_mappings
WHERE provider = 'claude'
	AND (
		upstream_model = 'claude-opus-5'
		OR upstream_model = 'claude-fable-5'
		OR upstream_model LIKE 'claude-opus-4%'
		OR upstream_model LIKE 'claude-sonnet-4%'
		OR upstream_model LIKE 'claude-opus-3%'
		OR upstream_model LIKE 'claude-sonnet-3%'
		OR upstream_model LIKE 'claude-haiku-3%'
		OR upstream_model LIKE 'claude-3-%'
	);
--> statement-breakpoint

-- Keep only MiniMax M3
DELETE FROM model_mappings
WHERE provider = 'minimax'
	AND upstream_model NOT IN ('MiniMax-M3');
--> statement-breakpoint

WITH candidates(id, label, provider, upstream_model, reasoning_budget, service_tier, sort_offset) AS (
	VALUES
		-- GPT-6 Sol (Cursor-safe ungate-* ids, same pattern as Astra)
		('ungate-sol-medium', 'GPT-6 Sol Medium', 'openai', 'gpt-6-sol', 'medium', 'default', 1),
		('ungate-sol-fast-medium', 'GPT-6 Sol Fast Medium', 'openai', 'gpt-6-sol', 'medium', 'priority', 2),
		('ungate-sol-high', 'GPT-6 Sol High', 'openai', 'gpt-6-sol', 'high', 'default', 3),
		('ungate-sol-fast-high', 'GPT-6 Sol Fast High', 'openai', 'gpt-6-sol', 'high', 'priority', 4),
		('ungate-sol-xhigh', 'GPT-6 Sol XHigh', 'openai', 'gpt-6-sol', 'xhigh', 'default', 5),
		('ungate-sol-max', 'GPT-6 Sol Max', 'openai', 'gpt-6-sol', 'max', 'default', 6),
		-- GPT-6 Luna
		('ungate-luna-medium', 'GPT-6 Luna Medium', 'openai', 'gpt-6-luna', 'medium', 'default', 7),
		('ungate-luna-fast-medium', 'GPT-6 Luna Fast Medium', 'openai', 'gpt-6-luna', 'medium', 'priority', 8),
		('ungate-luna-high', 'GPT-6 Luna High', 'openai', 'gpt-6-luna', 'high', 'default', 9),
		('ungate-luna-fast-high', 'GPT-6 Luna Fast High', 'openai', 'gpt-6-luna', 'high', 'priority', 10),
		('ungate-luna-xhigh', 'GPT-6 Luna XHigh', 'openai', 'gpt-6-luna', 'xhigh', 'default', 11),
		('ungate-luna-max', 'GPT-6 Luna Max', 'openai', 'gpt-6-luna', 'max', 'default', 12),
		-- Claude Opus 5.5
		('opus-5-5', 'Opus 5.5', 'claude', 'claude-opus-5-5', NULL, NULL, 13),
		('opus-5-5-low', 'Opus 5.5 Low', 'claude', 'claude-opus-5-5', 'low', NULL, 14),
		('opus-5-5-medium', 'Opus 5.5 Medium', 'claude', 'claude-opus-5-5', 'medium', NULL, 15),
		('opus-5-5-high', 'Opus 5.5 High', 'claude', 'claude-opus-5-5', 'high', NULL, 16),
		('opus-5-5-xhigh', 'Opus 5.5 XHigh', 'claude', 'claude-opus-5-5', 'xhigh', NULL, 17),
		('opus-5-5-max', 'Opus 5.5 Max', 'claude', 'claude-opus-5-5', 'max', NULL, 18)
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
			OR (existing.service_tier IS NULL AND candidate.service_tier = 'default')
			OR (existing.service_tier IS NULL AND candidate.service_tier IS NULL)
		)
);
