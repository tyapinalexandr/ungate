interface ModelPricing {
	inputPerMTok: number;
	outputPerMTok: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
	// OpenAI GPT-6 (current) + Terra still on 5.6
	'gpt-6-astra': { inputPerMTok: 10.0, outputPerMTok: 50.0 },
	'gpt-6-sol': { inputPerMTok: 2.0, outputPerMTok: 10.0 },
	'gpt-6-luna': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
	'gpt-5.6-terra': { inputPerMTok: 2.5, outputPerMTok: 15.0 },

	// Claude current lineup (Anthropic, Sep 2026)
	'claude-opus-5-5': { inputPerMTok: 4.0, outputPerMTok: 20.0 },
	'claude-fable-5-1': { inputPerMTok: 10.0, outputPerMTok: 50.0 },
	'claude-sonnet-5': { inputPerMTok: 2.0, outputPerMTok: 10.0 },
	'claude-haiku-4-5': { inputPerMTok: 1.0, outputPerMTok: 5.0 },

	// MiniMax
	'MiniMax-M3': { inputPerMTok: 0.5, outputPerMTok: 1.5 }
};

const DEFAULT_PRICING: ModelPricing = { inputPerMTok: 3.0, outputPerMTok: 15.0 };

export class Pricing {
	// Matches by prefix to handle date suffixes, e.g. "claude-sonnet-4-20250514" → "claude-sonnet-4"
	static getModel(modelId: string): ModelPricing {
		if (MODEL_PRICING[modelId]) {
			return MODEL_PRICING[modelId];
		}

		for (const [pattern, pricing] of Object.entries(MODEL_PRICING)) {
			if (modelId.startsWith(pattern)) {
				return pricing;
			}
		}

		return DEFAULT_PRICING;
	}

	// Cache pricing: cache_read = 0.1x input, cache_creation = 1.25x input
	static calculateCost(
		modelId: string,
		inputTokens: number,
		outputTokens: number,
		cacheReadTokens = 0,
		cacheCreationTokens = 0
	): number {
		const pricing = this.getModel(modelId);

		const regularInputTokens = inputTokens - cacheReadTokens - cacheCreationTokens;
		const regularInputCost = (regularInputTokens / 1_000_000) * pricing.inputPerMTok;
		const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.inputPerMTok * 0.1;
		const cacheCreationCost = (cacheCreationTokens / 1_000_000) * pricing.inputPerMTok * 1.25;
		const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;

		return regularInputCost + cacheReadCost + cacheCreationCost + outputCost;
	}
}
