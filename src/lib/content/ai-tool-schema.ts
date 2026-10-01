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
		'Substring search over note titles, tags, excerpts and bodies, ranked so title hits beat body hits. Prefer this over search_all when you only need notes.',
		{
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Text to search for.' },
				workspace,
				limit: { type: 'integer', description: 'Max notes to return (default 20).' }
			},
			required: ['query']
		}),
	tool('search_tasks', 'Search tasks', 'tasks', 'read',
		'Substring search over task titles and their notes field, ranked, and combinable with every list_tasks filter. Use it to find tasks by text when you do not know the id.',
		{
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Text to search for.' },
				workspace,
				status: { type: 'string', enum: ['todo', 'doing', 'review', 'done'] },
				priority: { type: 'string', enum: ['low', 'medium', 'high'] },
				folder: { type: 'string' },
				dueBefore: { type: 'string', description: 'YYYY-MM-DD; only tasks due strictly before this day.' },
				overdueOnly: { type: 'boolean', description: 'Only tasks overdue as of the user’s local day.' },
				includeDone: { type: 'boolean', description: 'Include done tasks (default true).' },
				limit: { type: 'integer', description: 'Max tasks to return (default 20).' }
			},
			required: ['query']
		}),
	tool('search_all', 'Search everything', 'notes', 'read',
		'One ranked text search across both notes and tasks, returned as two separate lists. Use it when the user asks "where did I write about X" without saying whether it is a note or a task.',
		{
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Text to search for.' },
				workspace,
				includeDone: { type: 'boolean', description: 'Include done tasks (default true).' },
				limit: { type: 'integer', description: 'Max results per kind (default 20).' }
			},
			required: ['query']
		}),
	tool('semantic_search', 'Search by meaning', 'notes', 'read',
		'Meaning-based search over notes and tasks. Use it when the user asks for notes about an idea, not a specific word or id; use search_notes for exact terms and codes. May be unavailable until the memory index is built.',
		{
			type: 'object',
			properties: {
				query: { type: 'string', description: 'The idea to search for.' },
				workspace,
				limit: { type: 'integer', description: 'Max results to return (default 10).' }
			},
			required: ['query']
		}),
	tool('related_notes', 'Related notes', 'notes', 'read',
		'Notes and tasks most similar in meaning to one entity. Use it to surface connections the user may not have linked. Pass an id from list_notes, search_notes or semantic_search.',
		{
			type: 'object',
			properties: {
				id: { type: 'string', description: 'Exact note or task id.' },
				kind: { type: 'string', enum: ['note', 'task'], description: 'Defaults to note.' },
				limit: { type: 'integer', description: 'Max results to return (default 8).' }
			},
			required: ['id']
		}),
	tool('list_themes', 'List themes', 'notes', 'read',
		'The current topic clusters over the notes and tasks, each with a label and member ids. Use it to answer "what am I writing about" or to group a broad question before drilling in.',
		{
			type: 'object',
			properties: {
				workspace,
				limit: { type: 'integer', description: 'Max themes to return (default 8).' }
			}
		}),
	tool('find_contradictions', 'Find contradictions', 'notes', 'read',
		'Pairs of notes whose claims conflict, verified by a model over the most similar pairs. Use it when the user asks whether their notes disagree. Needs the assistant configured; returns nothing when it is not.',
		{
			type: 'object',
			properties: {
				workspace,
				limit: { type: 'integer', description: 'Max pairs to verify (default 10).' }
			}
		},
		// Verifying a pair calls the app's own model stream, so this tool is for
		// the in-app assistant only: exposing it over MCP would let an external
		// agent spend the user's key as a proxy (same reason as `web_search`).
		{ aiOnly: true }),
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
				dueBefore: { type: 'string', description: 'YYYY-MM-DD; only tasks due strictly before this day.' },
				overdueOnly: { type: 'boolean', description: 'Only tasks overdue as of the user’s local day.' },
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
	tool('edit_note_body', 'Edit note', 'notes', 'write',
		'Patch a note body in place, without sending the whole note back. Prefer this over update_note_body whenever you can name the text you want to change: `op: "replace"` for a rename or version bump that may appear many times, `op: "insert"` to add to the start or end. The result reports how many matches were found and replaced, so you can verify without re-reading the note.',
		{
			type: 'object',
			properties: {
				id: { type: 'string' },
				op: {
					type: 'string',
					enum: ['replace', 'insert'],
					description: 'replace: swap text. insert: add text at the start or end.'
				},
				find: { type: 'string', description: 'For op "replace": the exact text to find. Copy it from get_note.' },
				replace: { type: 'string', description: 'For op "replace": the text to put in its place. Use "" to delete.' },
				occurrence: {
					type: 'string',
					enum: ['all', 'once'],
					description: 'For op "replace". Defaults to "all". "once" is refused unless find is unique.'
				},
				text: { type: 'string', description: 'For op "insert": the text to add.' },
				position: {
					type: 'string',
					enum: ['start', 'end'],
					description: 'For op "insert". Defaults to "end".'
				},
				workspace
			},
			required: ['id', 'op']
		}),
	tool('journal_today', 'Today’s journal', 'notes', 'write',
		'Find or start the journal entry for the user’s local today. Call it before writing anything a user would expect in today’s daily note, then add to it with edit_note_body { op: "insert", position: "end" }. Do not compute the date yourself: the app supplies the user’s own day. Returns created: true when this call started the entry.',
		{
			type: 'object',
			properties: { workspace }
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

/**
 * The tools that answer from the semantic index. With no embedder selected
 * they report "not ready" instead of an empty result (#D17), and that failure
 * is what tells the chat the user has never been offered memory at all — it
 * is the one moment where the switch is news rather than a setting they
 * already decided about.
 */
export const MEMORY_TOOL_NAMES: readonly string[] = [
	'semantic_search',
	'related_notes',
	'list_themes',
	'find_contradictions'
];

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
