import type { Config } from '../config';
import type { FastifyRequest, onRequestAsyncHookHandler } from 'fastify';

function extractPresentedKey(request: FastifyRequest): string | undefined {
	const authorization = request.headers.authorization;
	if (typeof authorization === 'string') {
		const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
		if (match?.[1]) {
			return match[1].trim();
		}
	}

	const header = request.headers['x-api-key'];
	if (typeof header === 'string' && header.trim()) {
		return header.trim();
	}
	if (Array.isArray(header) && header[0]?.trim()) {
		return header[0].trim();
	}

	return undefined;
}

/** Fail-closed: every protected route requires a non-empty configured proxy API key. */
export function apiKeyAuth(config: Config): onRequestAsyncHookHandler {
	return async (request, reply) => {
		// CORS preflight must not require Authorization — browsers omit it on OPTIONS.
		if (request.method === 'OPTIONS') {
			return;
		}

		if (!config.apiKey) {
			return reply.code(401).send({
				type: 'error',
				error: { type: 'authentication_error', message: 'Unauthorized: Proxy API key is not configured' }
			});
		}

		const key = extractPresentedKey(request);
		if (!key || key !== config.apiKey) {
			return reply.code(401).send({
				type: 'error',
				error: { type: 'authentication_error', message: 'Unauthorized: Invalid API key' }
			});
		}
	};
}

export function isPublicApiPath(urlPath: string): boolean {
	const path = urlPath.split('?')[0] ?? urlPath;
	return path === '/health' || path === '/auth/openai/callback';
}
