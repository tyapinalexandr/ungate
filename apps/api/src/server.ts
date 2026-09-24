import cors from '@fastify/cors';
import Fastify from 'fastify';

import { logger, setQuietMode } from 'src/utils/logger';

const BODY_LIMIT_BYTES = 256 * 1024 * 1024;

import { getConfig } from './config';
import { getDb } from './database/index';
import { Settings } from './database/settings';
import { apiKeyAuth, isPublicApiPath } from './plugins/auth';
import analyticsPlugin from './routes/analytics';
import anthropicPlugin from './routes/anthropic';
import authPlugin from './routes/auth';
import healthPlugin from './routes/health';
import modelsPlugin from './routes/models';
import openaiPlugin from './routes/openai';
import settingsPlugin from './routes/settings';

export async function startServer(): Promise<void> {
	globalThis.console.log('[startup] getDb...');
	getDb();

	globalThis.console.log('[startup] Settings.get...');
	const settings = Settings.get();
	const config = getConfig(settings);
	setQuietMode(config.quietMode);

	if (!config.apiKey) {
		throw new Error('[ungate] Refusing to start: proxy API key is missing (fail-closed)');
	}

	const app = Fastify({ logger: false, bodyLimit: BODY_LIMIT_BYTES });
	app.decorate('config', config);

	// Oversized bodies are rejected before any route runs. onError observes them without
	// replacing Fastify's default handler, which preserves the standard 413 response.
	app.addHook('onError', (request, _reply, error, done) => {
		if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
			const contentLength = request.headers['content-length'] ?? 'unknown';

			logger.error(`Request body too large: ${contentLength} bytes exceeds the ${BODY_LIMIT_BYTES}-byte limit.`);
		}

		done();
	});

	// CORS must be registered before auth so OPTIONS preflight from vscode-webview://
	// gets Access-Control-* headers. Auth still skips OPTIONS explicitly.
	globalThis.console.log('[startup] register cors...');
	await app.register(cors, {
		origin: true,
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Authorization', 'Content-Type', 'x-api-key'],
		credentials: false
	});

	const requireApiKey = apiKeyAuth(config);
	app.addHook('onRequest', async (request, reply) => {
		if (isPublicApiPath(request.url)) {
			return;
		}

		return requireApiKey(request, reply);
	});

	globalThis.console.log('[startup] register plugins...');
	await app.register(healthPlugin);
	await app.register(authPlugin);
	await app.register(anthropicPlugin);
	await app.register(openaiPlugin);
	await app.register(modelsPlugin);
	await app.register(analyticsPlugin);
	await app.register(settingsPlugin);

	globalThis.console.log(`[startup] listen ${config.port} on 127.0.0.1...`);
	await app.listen({ port: config.port, host: '127.0.0.1' });

	// Always print port to stdout — extension parses this to detect the running port.
	// Uses globalThis.console to bypass quiet mode.
	globalThis.console.log(`[ungate] listening on localhost:${config.port}`);
}
