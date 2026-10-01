import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	MCP_SCOPES,
	MCP_TOOLS,
	findTool,
	parseRustRegistry,
	toolAllowed,
	toolsByKind,
	toolsForScope,
} from '$lib/content/mcp-tools';
import { AI_TOOLS } from '$lib/content/ai-tool-schema';
import { MCP_SCOPE_IDS } from '$lib/content/mcp-types';

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

	/**
	 * Regression: the settings store and the MCP repo used to filter scopes
	 * against a hardcoded `['notes','tasks','dependency']`. Adding `workspace`
	 * to the registry then left its toggle permanently off. Every registered
	 * scope must be a value the settings layer will keep.
	 */
	it('advertises only scopes that the settings layer can persist', () => {
		expect(MCP_SCOPES.map((scope) => scope.id)).toEqual([...MCP_SCOPE_IDS]);
		for (const scope of MCP_SCOPES) {
			expect(toolsForScope(scope.id).length, `scope ${scope.id} has no tools`).toBeGreaterThan(0);
		}
	});

	it('allows reads always and writes only with a grant', () => {
		const read = findTool('get_task')!;
		const write = findTool('complete_task')!;
		expect(toolAllowed(read, { access: 'read', scopes: [] })).toBe(true);
		expect(toolAllowed(write, { access: 'read', scopes: ['tasks'] })).toBe(false);
		expect(toolAllowed(write, { access: 'write', scopes: [] })).toBe(false);
		expect(toolAllowed(write, { access: 'write', scopes: ['tasks'] })).toBe(true);
	});

	it('registers the semantic read tools with the same kind and scope', () => {
		for (const name of ['semantic_search', 'related_notes', 'list_themes']) {
			const tool = findTool(name);
			expect(tool, `${name} is missing from the registry`).toBeDefined();
			expect(tool?.kind, name).toBe('read');
			expect(tool?.scope, name).toBe('notes');
		}
	});

	/**
	 * `find_contradictions` calls the app's own model, so it must not be an MCP
	 * tool: an external agent could otherwise use the app as a proxy that spends
	 * the user's key. It lives only in the in-app assistant (`aiOnly`).
	 */
	it('keeps model-spending tools out of the MCP registry', () => {
		expect(findTool('find_contradictions')).toBeUndefined();
	});
	it('requires confirmations on destructive tools', () => {
		for (const name of ['delete_note', 'delete_task']) {
			expect(findTool(name)?.description.toLowerCase()).toContain('confirm');
		}
	});
});

describe('AI chat tool surface', () => {
	it('only exposes tools that exist in the MCP registry, unless they are AI-only', () => {
		for (const spec of AI_TOOLS) {
			if (spec.aiOnly) {
				// AI-only tools must not leak into the MCP registry.
				expect(findTool(spec.name), `AI-only tool ${spec.name} is in the MCP registry`).toBeUndefined();
				continue;
			}
			expect(findTool(spec.name), `unknown tool ${spec.name}`).toBeDefined();
		}
	});

	it('agrees with the registry on kind and scope', () => {
		for (const spec of AI_TOOLS) {
			if (spec.aiOnly) continue;
			const registry = findTool(spec.name)!;
			expect(spec.kind, spec.name).toBe(registry.kind);
			expect(spec.scope, spec.name).toBe(registry.scope);
		}
	});

	it('marks interactive tools so the chat pauses for the user', () => {
		const ask = AI_TOOLS.find((tool) => tool.name === 'ask_user_question')!;
		expect(ask.interactive).toBe(true);
		expect(ask.kind).toBe('read');
	});

	it('has unique tool names', () => {
		const names = AI_TOOLS.map((tool) => tool.name);
		expect(new Set(names).size).toBe(names.length);
	});
});
