import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	MCP_TOOLS,
	findTool,
	parseRustRegistry,
	toolAllowed,
	toolsByKind,
	toolsForScope,
} from '$lib/content/mcp-tools';

describe('MCP tool registry', () => {
	it('has unique names', () => {
		const names = MCP_TOOLS.map((tool) => tool.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it('matches the Rust shim registry exactly', () => {
		const source = readFileSync('src-tauri/src/mcp/registry.rs', 'utf8');
		const rust = parseRustRegistry(source).sort();
		const ts = MCP_TOOLS.map((tool) => tool.name).sort();
		expect(rust).toEqual(ts);
	});

	it('splits read and write tools', () => {
		expect(toolsByKind('read').length).toBeGreaterThan(0);
		expect(toolsByKind('write').length).toBeGreaterThan(0);
		expect(toolsByKind('read').every((tool) => tool.kind === 'read')).toBe(true);
	});

	it('groups tools by scope', () => {
		expect(toolsForScope('notes').every((tool) => tool.scope === 'notes')).toBe(true);
		expect(toolsForScope('dependency').map((tool) => tool.name)).toContain('link_tasks');
	});

	it('allows reads always and writes only with a grant', () => {
		const read = findTool('get_task')!;
		const write = findTool('complete_task')!;
		expect(toolAllowed(read, { access: 'read', scopes: [] })).toBe(true);
		expect(toolAllowed(write, { access: 'read', scopes: ['tasks'] })).toBe(false);
		expect(toolAllowed(write, { access: 'write', scopes: [] })).toBe(false);
		expect(toolAllowed(write, { access: 'write', scopes: ['tasks'] })).toBe(true);
	});

	it('requires confirmations on destructive tools', () => {
		for (const name of ['delete_note', 'delete_task']) {
			expect(findTool(name)?.description.toLowerCase()).toContain('confirm');
		}
	});
});
