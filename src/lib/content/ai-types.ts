/**
 * Shared contract for the AI assistant (BYOK, device-local).
 *
 * Everything here is pure data: the provider/model shapes, the streaming
 * envelope exchanged with the Rust gateway, and the persisted chat records.
 * Keeping it in one module means the Rust commands, the repo and the UI
 * cannot drift on field names.
 *
 * Privacy note: the free tier is bring-your-own-key. The key never leaves the
 * device and is encrypted at rest by the Rust side before it reaches SQLite.
 */

import type { McpAccess, McpScope } from '$lib/content/mcp-types';
import type { ToolResult } from '$lib/content/ai-tools';

/** Bumped whenever the streaming envelope or settings shape changes incompatibly. */
export const AI_PROTOCOL = 1;

/**
 * Providers the gateway knows how to talk to. `openai-compatible` covers
 * OpenAI, OpenRouter, Ollama, LM Studio and most gateways by base URL.
 */
export type AiProviderId = 'openai-compatible' | 'anthropic-native';

export type AiProviderMeta = {
	id: AiProviderId;
	label: string;
	/** Placeholder base URL shown in Settings; empty means the built-in default. */
	defaultBaseUrl: string;
	/** A concrete model id suggested in Settings. */
	defaultModel: string;
	/** Where the user gets a key. */
	hint: string;
};

export const AI_PROVIDERS: AiProviderMeta[] = [
	{
		id: 'openai-compatible',
		label: 'OpenAI-compatible',
		defaultBaseUrl: 'https://api.openai.com/v1',
		defaultModel: 'gpt-4o-mini',
		hint: 'Works with OpenAI, OpenRouter, Ollama, LM Studio or any compatible endpoint.'
	},
	{
		id: 'anthropic-native',
		label: 'Anthropic',
		defaultBaseUrl: 'https://api.anthropic.com',
		defaultModel: 'claude-3-5-haiku-latest',
		hint: 'Uses the Messages API with your Anthropic API key.'
	}
];

export type AiRole = 'system' | 'user' | 'assistant' | 'tool';

export type AiMessage = {
	role: AiRole;
	content: string;
	/** Set on an assistant message that requested tool calls. */
	toolCalls?: AiToolCall[];
	/** Set on a `tool` message: which call it answers. */
	toolCallId?: string;
};

/** A tool call the model requested. */
export type AiToolCall = {
	id: string;
	name: string;
	/** Raw JSON string of the arguments. */
	arguments: string;
};

/** A tool definition in OpenAI function-call shape. */
export type AiToolDefinition = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
};

/** How a tool is gated, mirroring the MCP kinds. */
export type AiToolKind = 'read' | 'write';

/** What the assistant is asked to do. Drives the system prompt. */
export type AiTask = 'chat' | 'summarize' | 'rewrite' | 'continue' | 'custom' | 'title';

/**
 * Settings row of the `ai_settings` singleton. The key itself is stored
 * separately (encrypted) and is only surfaced to the UI as `hasKey`.
 */
export type AiSettings = {
	enabled: boolean;
	provider: AiProviderId;
	baseUrl: string;
	model: string;
	temperature: number;
	maxTokens: number;
	/** Whether an API key is stored; the value itself is never read back. */
	hasKey: boolean;
	/** Tool grant: `read` allows read tools only; `write` also allows writes. */
	access: McpAccess;
	/** Scopes a write tool may touch, when `access` is `write`. */
	scopes: McpScope[];
	/**
	 * Web search provider, or `''` when search is off. Also `combo` to try
	 * `searchFallbacks` in order.
	 */
	searchProvider: string;
	/** Whether a search key is stored; never read back, like `hasKey`. */
	hasSearchKey: boolean;
	/** Providers tried in order when `searchProvider` is `combo`. */
	searchFallbacks: string[];
	updatedAt: string;
};

/** One web search provider the app supports, as reported by Rust. */
export type AiSearchProvider = {
	id: string;
	label: string;
	/** Where the user gets a key. */
	hint: string;
};

/** Request the frontend sends to the `ai_stream` command. */
export type AiStreamRequest = {
	/** Correlates stream events; echoed back on every chunk. */
	requestId: string;
	messages: AiMessage[];
	task: AiTask;
	/** Optional extra instruction for `rewrite`/`custom`. */
	instruction?: string;
};

/** One chunk delivered over the Tauri channel while streaming. */
export type AiStreamEvent =
	| { requestId: string; kind: 'start' }
	| { requestId: string; kind: 'delta'; text: string }
	/** The model's chain of thought, kept out of the answer body. */
	| { requestId: string; kind: 'reasoning'; text: string }
	| { requestId: string; kind: 'tool_call'; call: AiToolCall }
	| { requestId: string; kind: 'done'; finishReason: string }
	| { requestId: string; kind: 'error'; message: string };

/** Result of `ai_test_connection`, so Settings can show a clear verdict. */
export type AiTestResult = { ok: boolean; message: string };

/** Row of `ai_threads`. */
export type AiThread = {
	id: string;
	title: string;
	noteId: string | null;
	createdAt: string;
	updatedAt: string;
};

/** Row of `ai_messages`. */
export type AiMessageRecord = {
	id: number;
	threadId: string;
	role: AiRole;
	/** The answer body only; reasoning and tool traffic live in their own fields. */
	content: string;
	/** The model's chain of thought, when the provider streamed any. */
	reasoning: string;
	/** Tool calls the model requested on this turn, in request order. */
	toolCalls: AiToolCall[];
	/** Result per tool-call id. A call with no entry is still unanswered. */
	toolResults: Record<string, ToolResult>;
	createdAt: string;
};

/** Guard rails mirrored from the settings UI so the gateway rejects bad input early. */
export const AI_MIN_TEMPERATURE = 0;
export const AI_MAX_TEMPERATURE = 2;
export const AI_MIN_MAX_TOKENS = 1;
export const AI_MAX_MAX_TOKENS = 32_000;

/** Requests take a short hard timeout; streams may run longer but not forever. */
export const AI_TEST_TIMEOUT_MS = 20_000;
export const AI_STREAM_TIMEOUT_MS = 120_000;

/** Trims a request history so a long chat cannot blow past the context window. */
export const AI_MAX_CONTEXT_MESSAGES = 20;

/** How many tool-call round trips a single turn may make before giving up. */
export const AI_MAX_TOOL_STEPS = 6;
