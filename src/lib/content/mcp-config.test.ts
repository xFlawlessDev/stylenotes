import { describe, expect, it } from 'vitest';
import { buildMcpConfig, configLocationHint, defaultInstanceId } from '$lib/content/mcp-config';

describe('buildMcpConfig', () => {
	it('uses an absolute binary path and an instance id', () => {
		const config = JSON.parse(
			buildMcpConfig('claude', {
				binaryPath: 'C:\\Program Files\\StyleNotes\\stylenotes-mcp.exe',
				instanceId: 'abc123',
			})
		);
		const server = config.mcpServers.stylenotes;
		expect(server.command).toBe('C:\\Program Files\\StyleNotes\\stylenotes-mcp.exe');
		expect(server.args).toEqual(['--instance', 'claude-abc123']);
	});

	it('prefixes the instance with the target so clients are distinguishable', () => {
		const cursor = JSON.parse(buildMcpConfig('cursor', { binaryPath: '/usr/bin/stylenotes-mcp', instanceId: 'x9' }));
		expect(cursor.mcpServers.stylenotes.args).toEqual(['--instance', 'cursor-x9']);
	});

	it('falls back to the bare command when the path is unknown', () => {
		const config = JSON.parse(buildMcpConfig('claude', { binaryPath: '', instanceId: 'z' }));
		expect(config.mcpServers.stylenotes.command).toBe('stylenotes-mcp');
	});

	it('describes where each client keeps its config', () => {
		expect(configLocationHint('claude')).toContain('claude_desktop_config');
		expect(configLocationHint('cursor')).toContain('mcp.json');
	});
});

describe('defaultInstanceId', () => {
	it('slugs a seed value', () => {
		expect(defaultInstanceId('My Machine 01')).toBe('mymach');
	});

	it('never returns an empty id', () => {
		expect(defaultInstanceId('!!!').length).toBeGreaterThan(0);
	});
});
