import { describe, expect, it } from 'vitest';
import { buildMcpConfig, configLocationHint } from '$lib/content/mcp-config';

describe('buildMcpConfig', () => {
	it('builds a streamable HTTP server with a Bearer header', () => {
		const config = JSON.parse(
			buildMcpConfig('claude', {
				url: 'http://192.168.1.10:7317/mcp',
				token: 'abc123',
			})
		);
		const server = config.mcpServers.stylenotes;
		expect(server.type).toBe('http');
		expect(server.url).toBe('http://192.168.1.10:7317/mcp');
		expect(server.headers.Authorization).toBe('Bearer abc123');
	});

	it('falls back to the loopback endpoint and a token placeholder', () => {
		const config = JSON.parse(buildMcpConfig('cursor', { url: '', token: '' }));
		const server = config.mcpServers.stylenotes;
		expect(server.url).toBe('http://127.0.0.1:7317/mcp');
		expect(server.headers.Authorization).toBe('Bearer <access-token>');
	});

	it('produces the same shape for every client', () => {
		const input = { url: 'http://127.0.0.1:7317/mcp', token: 't' };
		expect(buildMcpConfig('claude', input)).toBe(buildMcpConfig('cursor', input));
	});

	it('describes where each client keeps its config', () => {
		expect(configLocationHint('claude')).toContain('claude_desktop_config');
		expect(configLocationHint('cursor')).toContain('mcp.json');
	});
});
