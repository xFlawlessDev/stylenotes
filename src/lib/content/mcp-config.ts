/**
 * Builds the ready-to-paste MCP client config (docs/design/mcp-local-free.md #D8).
 *
 * Pure and unit-tested: given the absolute shim path and an instance id it
 * produces the `mcpServers` block for Claude Desktop or Cursor. The app never
 * writes the client's config itself in V1 — a bad merge would delete the user's
 * other servers — so the user copies this snippet.
 */

export type McpConfigTarget = 'claude' | 'cursor';

export type McpConfigInput = {
	/** Absolute path of the installed `stylenotes-mcp` binary. */
	binaryPath: string;
	/** Instance id passed as `--instance`, so the app can name the client. */
	instanceId: string;
};

export const MCP_CONFIG_TARGETS: { id: McpConfigTarget; label: string }[] = [
	{ id: 'claude', label: 'Claude Desktop' },
	{ id: 'cursor', label: 'Cursor' },
];

/** The JSON block to paste into the client's config file. */
export function buildMcpConfig(target: McpConfigTarget, input: McpConfigInput): string {
	const command = input.binaryPath || 'stylenotes-mcp';
	return JSON.stringify(
		{
			mcpServers: {
				stylenotes: {
					command,
					args: ['--instance', `${target}-${input.instanceId}`],
				},
			},
		},
		null,
		2
	);
}

/** Where the client keeps its config, for the "open config folder" hint. */
export function configLocationHint(target: McpConfigTarget): string {
	return target === 'cursor'
		? 'Cursor: Settings → MCP → Add new MCP server, or edit ~/.cursor/mcp.json'
		: 'Claude Desktop: Settings → Developer → Edit Config (claude_desktop_config.json)';
}

/** `--instance` value shown in Settings and stored in the snippet. */
export function defaultInstanceId(seed: string): string {
	const clean = seed.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 6);
	return clean || randomSuffix();
}

function randomSuffix(): string {
	const cryptoRef: Crypto | undefined = globalThis.crypto;
	if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
		return cryptoRef.randomUUID().slice(0, 6);
	}
	return Math.random().toString(36).slice(2, 8);
}
