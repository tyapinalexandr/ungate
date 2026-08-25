import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnSyncMock = vi.fn();
const existsSyncMock = vi.fn();
const readdirSyncMock = vi.fn();

vi.mock('node:child_process', () => {
	return {
		spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
		spawn: vi.fn()
	};
});

vi.mock('node:fs', () => {
	return {
		existsSync: (...args: unknown[]) => existsSyncMock(...args),
		readdirSync: (...args: unknown[]) => readdirSyncMock(...args)
	};
});

import { NodeResolver } from '../../src/utils/node-resolver';

describe('NodeResolver', () => {
	const originalPlatform = process.platform;
	const originalExecPath = process.execPath;

	/**
	 * The `spawnSync` result `NodeResolver.inspect` parses for a single runtime, e.g.
	 * runtimeReport('127', 'linux', 'x64') -> { stdout: '{"abi":"127","platform":"linux","arch":"x64"}', ... }
	 */
	const runtimeReport = (abi: string, platform: string, arch: string) => {
		const stdout = JSON.stringify({ abi, platform, arch });

		return { error: undefined, status: 0, stdout, stderr: '', pid: 1, output: [null, stdout, ''], signal: null };
	};

	beforeEach(() => {
		spawnSyncMock.mockReset();
		existsSyncMock.mockReset();
		readdirSyncMock.mockReset();
	});

	afterEach(() => {
		Object.defineProperty(process, 'platform', { value: originalPlatform });
		Object.defineProperty(process, 'execPath', { value: originalExecPath });
	});

	it('returns a supported override path when UNGATE_NODE_BIN is provided via resolve argument', () => {
		spawnSyncMock.mockReturnValue({
			error: undefined,
			status: 0,
			stdout: '{"abi":"137","platform":"win32","arch":"x64"}',
			stderr: '',
			pid: 1,
			output: [null, '{"abi":"137","platform":"win32","arch":"x64"}', ''],
			signal: null
		});

		expect(NodeResolver.resolve('C:\\Program Files\\nodejs\\node.exe')).toBe('C:\\Program Files\\nodejs\\node.exe');
	});

	it('prefers the first usable Windows candidate', () => {
		Object.defineProperty(process, 'platform', { value: 'win32' });
		process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
		process.env.ProgramFiles = 'C:\\Program Files';

		const programFilesNode = path.join(process.env.ProgramFiles, 'nodejs', 'node.exe');

		spawnSyncMock.mockImplementation((command) => {
			if (command === 'node') {
				return { error: new Error('ENOENT'), status: 1, stdout: '', stderr: '', pid: 0, output: [null, '', ''], signal: null };
			}

			if (command === programFilesNode) {
				return {
					error: undefined,
					status: 0,
					stdout: '{"abi":"137","platform":"win32","arch":"x64"}',
					stderr: '',
					pid: 1,
					output: [null, '{"abi":"137","platform":"win32","arch":"x64"}', ''],
					signal: null
				};
			}

			return { error: new Error('ENOENT'), status: 1, stdout: '', stderr: '', pid: 0, output: [null, '', ''], signal: null };
		});

		existsSyncMock.mockImplementation((target) => {
			return String(target).endsWith('node.exe');
		});

		expect(NodeResolver.resolve()).toBe(programFilesNode);
	});

	it('skips an unsupported active Node and finds a supported asdf installation', () => {
		Object.defineProperty(process, 'platform', { value: 'darwin' });
		const asdfRoot = path.join(os.homedir(), '.asdf', 'installs', 'nodejs');
		const supportedNode = path.join(asdfRoot, '24.16.0', 'bin', 'node');

		existsSyncMock.mockImplementation((target) => String(target) === asdfRoot);
		readdirSyncMock.mockImplementation((target) => (String(target) === asdfRoot ? ['23.9.0', '24.16.0'] : []));
		spawnSyncMock.mockImplementation((command) => {
			if (command === 'node') {
				return {
					error: undefined,
					status: 0,
					stdout: '{"abi":"131","platform":"darwin","arch":"arm64"}',
					stderr: '',
					pid: 1,
					output: [null, '{"abi":"131","platform":"darwin","arch":"arm64"}', ''],
					signal: null
				};
			}

			if (command === supportedNode) {
				return {
					error: undefined,
					status: 0,
					stdout: '{"abi":"137","platform":"darwin","arch":"arm64"}',
					stderr: '',
					pid: 2,
					output: [null, '{"abi":"137","platform":"darwin","arch":"arm64"}', ''],
					signal: null
				};
			}

			return { error: new Error('ENOENT'), status: 1, stdout: '', stderr: '', pid: 0, output: [null, '', ''], signal: null };
		});

		expect(NodeResolver.resolve()).toBe(supportedNode);
	});

	it('falls back to the editor server Node when every system Node has an unsupported ABI', () => {
		Object.defineProperty(process, 'platform', { value: 'linux' });

		// A remote window forks its extension host from the editor server's own Node.
		const editorServerNode = '/home/dev/.cursor-server/bin/2fdd31c9/node';

		Object.defineProperty(process, 'execPath', { value: editorServerNode });

		existsSyncMock.mockReturnValue(false);
		readdirSyncMock.mockReturnValue([]);
		spawnSyncMock.mockImplementation((command) => {
			if (command === editorServerNode) {
				return runtimeReport('127', 'linux', 'x64');
			}

			// Every system location on this host is the distro's Node 20, which has no prebuild.
			return runtimeReport('115', 'linux', 'x64');
		});

		expect(NodeResolver.resolve()).toBe(editorServerNode);
	});

	it('never inspects the editor executable when the extension host runs inside Electron', () => {
		Object.defineProperty(process, 'platform', { value: 'linux' });

		// A desktop window reports the editor binary itself, which must not be spawned.
		const editorExecutable = '/opt/cursor/cursor';

		Object.defineProperty(process, 'execPath', { value: editorExecutable });

		existsSyncMock.mockReturnValue(false);
		readdirSyncMock.mockReturnValue([]);
		spawnSyncMock.mockReturnValue(runtimeReport('115', 'linux', 'x64'));

		expect(() => NodeResolver.resolve()).toThrow('No supported Node runtime found');
		expect(spawnSyncMock).not.toHaveBeenCalledWith(editorExecutable, expect.anything(), expect.anything());
	});

	it('rejects an unsupported explicit override', () => {
		spawnSyncMock.mockReturnValue({
			error: undefined,
			status: 0,
			stdout: '{"abi":"131","platform":"darwin","arch":"arm64"}',
			stderr: '',
			pid: 1,
			output: [null, '{"abi":"131","platform":"darwin","arch":"arm64"}', ''],
			signal: null
		});

		expect(() => NodeResolver.resolve('/custom/node')).toThrow('must point to Node 22, 24, 25 or 26');
	});

	it('throws an actionable error when no candidate is supported', () => {
		Object.defineProperty(process, 'platform', { value: 'darwin' });

		existsSyncMock.mockReturnValue(false);
		readdirSyncMock.mockReturnValue([]);
		spawnSyncMock.mockReturnValue({
			error: undefined,
			status: 0,
			stdout: '{"abi":"131","platform":"darwin","arch":"arm64"}',
			stderr: '',
			pid: 1,
			output: [null, '{"abi":"131","platform":"darwin","arch":"arm64"}', ''],
			signal: null
		});

		expect(() => NodeResolver.resolve()).toThrow('No supported Node runtime found');
	});

	it('inspect returns abi platform and arch from runtime output', () => {
		spawnSyncMock.mockReturnValue({
			error: undefined,
			status: 0,
			stdout: '{"abi":"137","platform":"win32","arch":"x64"}',
			stderr: '',
			pid: 1,
			output: [null, '{"abi":"137","platform":"win32","arch":"x64"}', ''],
			signal: null
		});

		expect(NodeResolver.inspect('C:\\Program Files\\nodejs\\node.exe')).toEqual({
			abi: '137',
			platform: 'win32',
			arch: 'x64'
		});
	});
});
