import {
	sleep,
	type AnalyticsSummary,
	type AppSettings,
	type Period,
	type RequestRecord,
	type TokenSeriesPoint
} from '@ungate/shared/frontend';

type UngateWindow = Window & { __PORT__?: number | null; __API_KEY__?: string | null };

export class Api {
	private static port: number | null = (window as UngateWindow).__PORT__ ?? null;
	private static apiKey: string | null = (window as UngateWindow).__API_KEY__ ?? null;
	private static readonly portWaiters = new Set<(port: number) => void>();
	private static readonly apiKeyWaiters = new Set<(apiKey: string) => void>();

	static {
		window.addEventListener('message', (event: MessageEvent) => {
			const message = event.data as { type?: string; port?: number | null; apiKey?: string | null };

			if (message.type === 'port') {
				this.port = message.port ?? null;

				if (message.port) {
					for (const resolve of this.portWaiters) {
						resolve(message.port);
					}

					this.portWaiters.clear();
				}
			}

			if (message.type === 'api-key' && typeof message.apiKey === 'string' && message.apiKey.trim()) {
				this.apiKey = message.apiKey.trim();
				(window as UngateWindow).__API_KEY__ = this.apiKey;

				for (const resolve of this.apiKeyWaiters) {
					resolve(this.apiKey);
				}

				this.apiKeyWaiters.clear();
			}
		});
	}

	private static async getPort(): Promise<number> {
		const injected = (window as UngateWindow).__PORT__;

		if (injected) {
			return injected;
		}

		if (this.port) {
			return this.port;
		}

		const port = await new Promise<number>((resolve, reject) => {
			const resolveWithCleanup = (nextPort: number) => {
				this.portWaiters.delete(resolveWithCleanup);
				resolve(nextPort);
			};

			this.portWaiters.add(resolveWithCleanup);

			void sleep(5000)
				.then(() => {
					this.portWaiters.delete(resolveWithCleanup);
					reject(new Error('Ungate API is still starting'));
				})
				.catch(() => {});
		});

		return port;
	}

	private static async getApiKey(): Promise<string> {
		const injected = (window as UngateWindow).__API_KEY__;
		if (injected?.trim()) {
			this.apiKey = injected.trim();
		}

		if (this.apiKey?.trim()) {
			return this.apiKey.trim();
		}

		const apiKey = await new Promise<string>((resolve, reject) => {
			const resolveWithCleanup = (nextKey: string) => {
				this.apiKeyWaiters.delete(resolveWithCleanup);
				resolve(nextKey);
			};

			this.apiKeyWaiters.add(resolveWithCleanup);

			void sleep(5000)
				.then(() => {
					this.apiKeyWaiters.delete(resolveWithCleanup);
					reject(new Error('Ungate proxy API key is not available in the dashboard yet'));
				})
				.catch(() => {});
		});

		return apiKey;
	}

	private static async authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
		return {
			Authorization: `Bearer ${await this.getApiKey()}`,
			...extra
		};
	}

	private static async baseUrl(): Promise<string> {
		const port = await this.getPort();

		// Prefer IPv4 loopback: API listens on 127.0.0.1 only. `localhost` may resolve to ::1
		// in Chromium webviews and yield TypeError: Failed to fetch.
		return `http://127.0.0.1:${port}`;
	}

	private static async get<T>(path: string): Promise<T> {
		const baseUrl = await this.baseUrl();
		const response = await fetch(`${baseUrl}${path}`, {
			headers: await this.authHeaders()
		});

		if (!response.ok) {
			throw new Error(`GET ${path} failed: ${response.status}`);
		}

		return response.json() as Promise<T>;
	}

	private static async post<T>(path: string, body?: unknown): Promise<T> {
		const baseUrl = await this.baseUrl();
		const response = await fetch(`${baseUrl}${path}`, {
			method: 'POST',
			headers: await this.authHeaders({ 'Content-Type': 'application/json' }),
			body: JSON.stringify(body ?? {})
		});

		if (!response.ok) {
			let detail = '';
			try {
				const body = (await response.json()) as { error?: string };
				detail = body.error ?? '';
			} catch {}

			throw new Error(`POST ${path} failed: ${response.status}${detail ? ` — ${detail}` : ''}`);
		}

		return response.json() as Promise<T>;
	}

	static fetchAnalytics(period: Period): Promise<AnalyticsSummary> {
		return this.get(`/analytics?period=${period}`);
	}

	static fetchRequests(limit: number): Promise<{ requests: RequestRecord[] }> {
		return this.get(`/analytics/requests?limit=${limit}`);
	}

	static fetchTokenSeries(period: Period): Promise<{ period: Period; series: TokenSeriesPoint[] }> {
		return this.get(`/analytics/tokens?period=${period}`);
	}

	static resetAnalytics(): Promise<{ success: boolean; deletedCount: number }> {
		return this.post('/analytics/reset');
	}

	static fetchSettings(): Promise<AppSettings> {
		return this.get('/settings');
	}

	static updateSettings(settings: Partial<AppSettings>): Promise<{ ok: boolean }> {
		return this.post('/settings', settings);
	}

	static authStart(): Promise<{ authUrl: string; sessionId: string }> {
		return this.post('/auth/claude/start');
	}

	static authComplete(code: string, sessionId: string): Promise<{ ok: boolean; email?: string; error?: string }> {
		return this.post('/auth/claude/complete', { code, sessionId });
	}

	static authStatus(): Promise<{ authenticated: boolean; email?: string }> {
		return this.get('/auth/claude/status');
	}

	static authLogout(): Promise<{ ok: boolean }> {
		return this.post('/auth/claude/logout');
	}

	static authMinimaxStatus(): Promise<{ authenticated: boolean; baseUrl?: string }> {
		return this.get('/auth/minimax/status');
	}

	static authMinimaxLogin(apiKey: string, baseUrl: string): Promise<{ ok: boolean; error?: string }> {
		return this.post('/auth/minimax/login', { apiKey, baseUrl });
	}

	static authMinimaxUpdateBaseUrl(baseUrl: string): Promise<{ ok: boolean; error?: string }> {
		return this.post('/auth/minimax/base-url', { baseUrl });
	}

	static authMinimaxLogout(): Promise<{ ok: boolean }> {
		return this.post('/auth/minimax/logout');
	}

	static authChatGPTStart(): Promise<{ authUrl: string; sessionId: string }> {
		return this.get('/auth/openai/start');
	}

	static authChatGPTStatus(): Promise<{ authenticated: boolean; email?: string }> {
		return this.get('/auth/openai/status');
	}

	static authChatGPTLogout(): Promise<{ ok: boolean }> {
		return this.post('/auth/openai/logout');
	}

	static async healthCheck(): Promise<boolean> {
		try {
			const baseUrl = await this.baseUrl();
			const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) });

			return response.ok;
		} catch {
			return false;
		}
	}
}
