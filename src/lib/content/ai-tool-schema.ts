/**
 * Tool definitions offered to the AI chat.
 *
 * The names and purposes mirror the local MCP registry
 * (`src/lib/content/mcp-tools.ts`); this module only adds the JSON Schema the
 * model needs to call them. The executor lives in `ai-tools.ts`.
 *
 * Read tools answer from the in-app snapshot; write tools go through the same
 * validated actions the MCP bridge uses, behind an explicit AI grant.
 */

import type { AiToolDefinition } from '$lib/content/ai-types';
import type { McpScope } from '$lib/content/mcp-types';

export type AiToolSpec = {
	name: string;
	scope: McpScope;
	kind: 'read' | 'write';
	/** Human label for the confirmation card and the tool-call chip. */
	label: string;
	definition: AiToolDefinition;
	/**
	 * True for tools that are not part of the MCP registry and run only for the
	 * in-app assistant. The registry cross-check test skips these.
	 */
	aiOnly?: boolean;
	/**
	 * True when the tool needs a live user choice at call time. The chat pauses
	 * and shows the tool's own card instead of running it unattended.
	 */
	interactive?: boolean;
};

function tool(
	name: string,
	label: string,
	scope: McpScope,
	kind: 'read' | 'write',
	description: string,
	parameters: Record<string, unknown>,
	options: { aiOnly?: boolean; interactive?: boolean } = {}
): AiToolSpec {
	return {
		name,
		label,
		scope,
		kind,
		aiOnly: options.aiOnly,
		interactive: options.interactive,
		definition: {
			type: 'function',
			function: { name, description, parameters }
		}
	};
}

const workspace = {
	type: 'string',
	description: 'Workspace id. Omit to search every workspace.'
};

/** The tool surface the assistant may use. */
export const AI_TOOLS: AiToolSpec[] = [
	tool('list_notes', 'List notes', 'notes', 'read',
		'List notes with optional workspace, folder, tag and pinned filters.',
		{
			type: 'object',
			properties: {
				workspace,
				folder: { type: 'string', description: 'Folder id to filter by.' },
				tag: { type: 'string', description: 'Only notes carrying this tag.' },
				pinnedOnly: { type: 'boolean', description: 'Only pinned notes.' },
				limit: { type: 'integer', description: 'Max notes to return (default 50).' }
			}
		}),
	tool('search_notes', 'Search notes', 'notes', 'read',
		'Substring search over note titles, tags and bodies.',
		{
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Text to search for.' },
				workspace,
				limit: { type: 'integer', description: 'Max notes to return (default 20).' }
			},
			required: ['query']
		}),
	tool('get_note', 'Read note', 'notes', 'read',
		'One note with its full body plus wiki backlinks and outlinks. Use an id from list_notes or search_notes; this does not accept a title.',
		{
			type: 'object',
			properties: {
				id: { type: 'string', description: 'Exact note id from list_notes/search_notes, optionally <workspaceId>/<id>.' },
				workspace
			},
			required: ['id']
		}),
	tool('list_tasks', 'List tasks', 'tasks', 'read',
		'List tasks with status, priority, folder, due and overdue filters.',
		{
			type: 'object',
			properties: {
				workspace,
				status: { type: 'string', enum: ['todo', 'doing', 'review', 'done'] },
				priority: { type: 'string', enum: ['low', 'medium', 'high'] },
				folder: { type: 'string' },
				includeDone: { type: 'boolean', description: 'Include done tasks (default true).' },
				limit: { type: 'integer', description: 'Max tasks to return (default 50).' }
			}
		}),
	tool('get_task', 'Read task', 'tasks', 'read',
		'One task with blockers, dependents and linked notes. Use an id from list_tasks; this does not accept a title.',
		{
			type: 'object',
			properties: {
				id: { type: 'string', description: 'Exact task id from list_tasks, optionally <workspaceId>/<id>.' },
				workspace
			},
			required: ['id']
		}),
	tool('task_board', 'Task board', 'tasks', 'read',
		'Kanban columns in position order with per-status counts.',
		{
			type: 'object',
			properties: { workspace }
		}),
	tool('daily_summary', 'Daily summary', 'tasks', 'read',
		'Overdue and completed work, in-progress tasks and recently touched notes.',
		{
			type: 'object',
			properties: { workspace }
		}),
	tool('list_folders', 'List folders', 'workspace', 'read',
		'Folder ids with note counts. Use these ids for the folder filter in list_notes and for update_note; a label is not accepted anywhere.',
		{
			type: 'object',
			properties: { workspace }
		}),
	tool('list_tags', 'List tags', 'notes', 'read',
		'Every tag in use, with how many notes carry it. Call this before tagging a note so you reuse the vocabulary the vault already has.',
		{
			type: 'object',
			properties: { workspace }
		}),
	tool('graph_query', 'Query graph', 'notes', 'read',
		'Graph nodes and edges around a node, by depth and edge kind.',
		{
			type: 'object',
			properties: {
				id: { type: 'string', description: 'Note or task id to centre on.' },
				depth: { type: 'integer', description: 'Hops to expand (default 1).' },
				kind: { type: 'string', enum: ['wiki', 'dependency', 'link'], description: 'Edge kind.' }
			},
			required: ['id']
		}),
	tool('create_note', 'Create note', 'notes', 'write',
		'Create a note from a title and body.',
		{
			type: 'object',
			properties: {
				title: { type: 'string' },
				body: { type: 'string' },
				folder: { type: 'string' },
				tags: { type: 'array', items: { type: 'string' } },
				workspace
			},
			required: ['title']
		}),
	tool('update_note_body', 'Write to note', 'notes', 'write',
		'Replace a note body (a backup copy is kept first).',
		{
			type: 'object',
			properties: {
				id: { type: 'string' },
				body: { type: 'string' },
				workspace
			},
			required: ['id', 'body']
		}),
	tool('update_note', 'Update note', 'notes', 'write',
		'Patch a note’s metadata: title, folder, tags and pinned. Use it to fix a bad title, re-file a note, or add the tags the recall tools rank by. It never touches the body.',
		{
			type: 'object',
			properties: {
				id: { type: 'string' },
				patch: {
					type: 'object',
					description: 'Fields to change: title, folder, tags, pinned. Omit a field to leave it alone.',
					properties: {
						title: { type: 'string' },
						folder: { type: 'string', description: 'Folder id from list_folders.' },
						tags: { type: 'array', items: { type: 'string' }, description: 'Replaces the tag list.' },
						pinned: { type: 'boolean' }
					}
				},
				workspace
			},
			required: ['id', 'patch']
		}),
	tool('create_task', 'Create task', 'tasks', 'write',
		'Create a task, optionally linked to notes.',
		{
			type: 'object',
			properties: {
				title: { type: 'string' },
				status: { type: 'string', enum: ['todo', 'doing', 'review', 'done'] },
				priority: { type: 'string', enum: ['low', 'medium', 'high'] },
				folder: { type: 'string' },
				dueAt: { type: 'string', description: 'ISO date.' },
				notes: { type: 'string', description: 'Notes text for the task.' },
				workspace
			},
			required: ['title']
		}),
	tool('update_task', 'Update task', 'tasks', 'write',
		'Patch fields on an existing task.',
		{
			type: 'object',
			properties: {
				id: { type: 'string' },
				patch: {
					type: 'object',
					description: 'Fields to change: title, status, priority, folder, dueAt, notes.'
				},
				workspace
			},
			required: ['id', 'patch']
		}),
	tool('complete_task', 'Complete task', 'tasks', 'write',
		'Mark a task done.',
		{
			type: 'object',
			properties: { id: { type: 'string' }, workspace },
			required: ['id']
		}),
	tool('delete_task', 'Delete task', 'tasks', 'write',
		'Delete a task. Requires confirm: true.',
		{
			type: 'object',
			properties: {
				id: { type: 'string' },
				confirm: { type: 'boolean', description: 'Must be true to delete.' },
				workspace
			},
			required: ['id', 'confirm']
		}),
	tool('delete_note', 'Delete note', 'notes', 'write',
		'Delete a note. Requires confirm: true.',
		{
			type: 'object',
			properties: {
				id: { type: 'string' },
				confirm: { type: 'boolean', description: 'Must be true to delete.' },
				workspace
			},
			required: ['id', 'confirm']
		}),
	// --- assistant-only tools (not part of the local MCP registry) ------------
	// These need either a live user choice or the network, so they run inside
	// the app and are deliberately absent from `mcp-tools.ts` / the shim.
	tool('ask_user_question', 'Ask you a question', 'notes', 'read',
		'Ask the user to choose between options when their request is ambiguous and you cannot resolve it from their notes and tasks. Prefer this over guessing: the answer comes back as the tool result. Ask at most 4 questions at once, each with 2-4 short options. Do not use it to ask permission or to make small talk.',
		{
			type: 'object',
			properties: {
				questions: {
					type: 'array',
					description: 'Questions to put to the user, in order.',
					items: {
						type: 'object',
						properties: {
							question: { type: 'string', description: 'The question itself, in the user’s language.' },
							header: { type: 'string', description: 'Short label for the card, 16 characters or fewer.' },
							multiSelect: { type: 'boolean', description: 'Allow choosing more than one option.' },
							options: {
								type: 'array',
								description: 'Between 2 and 4 options.',
								items: {
									type: 'object',
									properties: {
										label: { type: 'string', description: 'Short choice text, 60 characters or fewer.' },
										description: { type: 'string', description: 'One line explaining the trade-off.' }
									},
									required: ['label']
								}
							}
						},
						required: ['question', 'header', 'options']
					}
				}
			},
			required: ['questions']
		},
		{ aiOnly: true, interactive: true }),
	tool('web_search', 'Search the web', 'notes', 'read',
		'Search the web for current information that is not in the user’s notes: recent events, library or API documentation, facts you are unsure about. Returns titles, URLs and snippets. Follow up with web_fetch on the most promising result when you need the full text.',
		{
			type: 'object',
			properties: {
				query: { type: 'string', description: 'The search query.' },
				limit: { type: 'integer', description: 'Max results to return (default 5).' }
			},
			required: ['query']
		},
		{ aiOnly: true }),
	tool('web_fetch', 'Read a web page', 'notes', 'read',
		'Fetch one web page and return its readable text. Use it on a URL from web_search, or one the user gave you. Local and private addresses are refused.',
		{
			type: 'object',
			properties: {
				url: { type: 'string', description: 'Absolute http or https URL.' },
				maxChars: { type: 'integer', description: 'Text budget in characters (default 12000).' }
			},
			required: ['url']
		},
		{ aiOnly: true })
];

export function findAiTool(name: string): AiToolSpec | undefined {
	return AI_TOOLS.find((tool) => tool.name === name);
}

/** Labels for the tool-call chip, keyed by tool name. */
export function toolLabel(name: string): string {
	return findAiTool(name)?.label ?? name;
}

/**
 * The definitions the model may call under a grant. Read tools are always
 * available; a write tool needs write access and its scope.
 */
export function toolDefinitions(grant: {
	access: 'read' | 'write';
	scopes: McpScope[];
}): AiToolDefinition[] {
	return AI_TOOLS.filter(
		(tool) =>
			tool.kind === 'read' ||
			(grant.access === 'write' && grant.scopes.includes(tool.scope))
	).map((tool) => tool.definition);
}
