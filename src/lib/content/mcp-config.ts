/**
 * Builds the ready-to-paste MCP client config (docs/design/constella-features.md
 * #D12).
 *
 * Pure and unit-tested: given the endpoint URL and the access token it produces
 * the Streamable HTTP `mcpServers` block for Claude Desktop, Cursor, or any
 * client that speaks the HTTP transport. The app never writes the client's
 * config itself — a bad merge would delete the user's other servers — so the
 * user copies this snippet.
 */

export type McpConfigTarget = 'claude' | 'cursor';

export type McpConfigInput = {
	/** Full endpoint URL, e.g. `http://127.0.0.1:7317/mcp`. */
	url: string;
	/** Bearer token shown once by the remote settings. */
	token: string;
};

export const MCP_CONFIG_TARGETS: { id: McpConfigTarget; label: string }[] = [
	{ id: 'claude', label: 'Claude Desktop' },
	{ id: 'cursor', label: 'Cursor' },
];

/** The JSON block to paste into the client's config file. */
export function buildMcpConfig(_target: McpConfigTarget, input: McpConfigInput): string {
	const url = input.url || 'http://127.0.0.1:7317/mcp';
	const token = input.token || '<access-token>';
	// Both clients accept the same Streamable HTTP server shape; `type` picks the
	// transport and the header carries the Bearer token the listener requires.
	return JSON.stringify(
		{
			mcpServers: {
				stylenotes: {
					type: 'http',
					url,
					headers: {
						Authorization: `Bearer ${token}`,
					},
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
