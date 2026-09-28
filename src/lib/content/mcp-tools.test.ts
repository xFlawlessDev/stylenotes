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
import { AI_TOOLS } from '$lib/content/ai-tool-schema';

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

describe('AI chat tool surface', () => {
	it('only exposes tools that exist in the MCP registry', () => {
		for (const spec of AI_TOOLS) {
			expect(findTool(spec.name), `unknown tool ${spec.name}`).toBeDefined();
		}
	});

	it('agrees with the registry on kind and scope', () => {
		for (const spec of AI_TOOLS) {
			const registry = findTool(spec.name)!;
			expect(spec.kind, spec.name).toBe(registry.kind);
			expect(spec.scope, spec.name).toBe(registry.scope);
		}
	});

	it('has unique tool names', () => {
		const names = AI_TOOLS.map((tool) => tool.name);
		expect(new Set(names).size).toBe(names.length);
	});
});
