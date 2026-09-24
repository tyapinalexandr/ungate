import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { eq } from 'drizzle-orm';

import { ModelMappings } from './model-mappings';
import { appSettings } from './schema';

import { getDb } from './index';

import type { AppSettings } from '@ungate/shared';

const PROXY_API_KEY_FILE = path.join(os.homedir(), '.ungate', 'proxy-api-key');

export class Settings {
	private static generateApiKey(): string {
		return crypto.randomBytes(32).toString('base64url');
	}

	private static persistProxyApiKeyFile(apiKey: string): void {
		const dir = path.dirname(PROXY_API_KEY_FILE);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(PROXY_API_KEY_FILE, apiKey, { encoding: 'utf8', mode: 0o600 });
		try {
			fs.chmodSync(PROXY_API_KEY_FILE, 0o600);
		} catch {
			// best-effort on platforms that ignore mode
		}
	}

	static get(): AppSettings {
		const db = getDb();
		let row = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
		if (!row) {
			[row] = db
				.insert(appSettings)
				.values({
					id: 1,
					apiKey: this.generateApiKey()
				})
				.returning()
				.all();
		} else if (!row.apiKey?.trim()) {
			const apiKey = this.generateApiKey();
			db.update(appSettings).set({ apiKey }).where(eq(appSettings.id, 1)).run();
			row = { ...row, apiKey };
		}

		const apiKey = row.apiKey!;
		this.persistProxyApiKeyFile(apiKey);

		return {
			port: row.port,
			apiKey,
			quiet: row.quiet,
			extraInstruction: row.extraInstruction,
			models: ModelMappings.list()
		};
	}

	static update(settings: Partial<AppSettings>): void {
		const db = getDb();

		let nextApiKey: string | undefined;
		if (settings.apiKey !== undefined) {
			if (settings.apiKey === null || !String(settings.apiKey).trim()) {
				throw new Error('apiKey cannot be null or empty');
			}
			nextApiKey = String(settings.apiKey).trim();
		}

		db.insert(appSettings)
			.values({ id: 1 })
			.onConflictDoUpdate({
				target: appSettings.id,
				set: {
					...(settings.port !== undefined && { port: settings.port }),
					...(nextApiKey !== undefined && { apiKey: nextApiKey }),
					...(settings.quiet !== undefined && { quiet: settings.quiet }),
					...(settings.extraInstruction !== undefined && { extraInstruction: settings.extraInstruction })
				}
			})
			.run();

		if (nextApiKey !== undefined) {
			this.persistProxyApiKeyFile(nextApiKey);
		}

		if (settings.models !== undefined) {
			ModelMappings.replace(settings.models);
		}
	}
}
