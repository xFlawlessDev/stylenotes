import { browser } from '$app/environment';
import { invoke, Channel } from '@tauri-apps/api/core';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
	AI_PROVIDERS,
	AI_MAX_CONTEXT_MESSAGES,
	AI_MAX_TOOL_STEPS,
	type AiMessage,
	type AiSettings,
	type AiStreamEvent,
	type AiStreamRequest,
	type AiTask,
	type AiTestResult,
	type AiThread,
	type AiMessageRecord,
	type AiToolCall,
	type AiToolDefinition
} from '$lib/content/ai-types';
import type { McpScope } from '$lib/content/mcp-types';
import type { ToolResult } from '$lib/content/ai-tools';
import { aiRepo } from '$lib/db/ai';
import { sanitizeThreadTitle, titlePrompt } from '$lib/content/ai-assistant';
import { isTauri } from '$lib/windows';
import { t } from '$lib/i18n/index.svelte';
import {
	AI_CHANGED,
	aiReady,
	providerConfig,
	updateAiGrant,
	updateAiSettings
} from '$lib/stores/ai-settings.svelte';

// Re-exported so callers keep importing settings helpers from the AI store.
export {
	AI_CHANGED,
	aiReady,
	clearAiKey,
	notifyChanged,
	resolveKey,
	providerConfig,
	toggleAiScope,
	updateAiGrant,
	updateAiSettings,
	updateSearchKey,
	updateSearchSettings,
	webSearchReady
} from '$lib/stores/ai-settings.svelte';
/** Row defaults for a first run, before the Settings page is ever opened. */
const DEFAULT_SETTINGS: AiSettings = {
	enabled: false,
	provider: 'openai-compatible',
	baseUrl: '',
	model: '',
	temperature: 0.7,
	maxTokens: 1024,
	hasKey: false,
	access: 'read',
	scopes: [],
	searchProvider: '',
	hasSearchKey: false,
	searchFallbacks: [],
	updatedAt: ''
};

/**
 * The single AI store every window shares: settings, threads, and the open
 * conversation. Settings persistence lives in `ai-settings.svelte.ts`; this
 * module owns the conversation and streaming.
 */
export const aiStore = $state<{
	settings: AiSettings;
	threads: AiThread[];
	/** The open conversation, oldest first. */
	messages: AiMessageRecord[];
	/** The thread the panel is showing; `null` until one is opened or created. */
	activeThreadId: string | null;
	/** True while a completion is streaming into the panel or popover. */
	streaming: boolean;
	/** Non-null when the last write or request failed; surfaced in Settings. */
	error: string | null;
	/** True once the settings have been read at least once. */
	hydrated: boolean;
}>({
	settings: { ...DEFAULT_SETTINGS },
	threads: [],
	messages: [],
	activeThreadId: null,
	streaming: false,
	error: null,
	hydrated: false
});

/** The provider descriptor for the active provider. */
export function activeProvider() {
	return AI_PROVIDERS.find((item) => item.id === aiStore.settings.provider) ?? AI_PROVIDERS[0];
}

let hydrated = false;
let started = false;
let unlisten: UnlistenFn | undefined;

export async function hydrateAi(): Promise<void> {
	if (!browser) {
		aiStore.hydrated = true;
		return;
	}
	if (!hydrated) {
		hydrated = true;
		aiStore.settings = await aiRepo.loadSettings();
		aiStore.threads = await aiRepo.listThreads();
	}
	aiStore.hydrated = true;
}

/** Starts the settings listener shared by every window. Idempotent. */
export async function startAiSync(): Promise<void> {
	if (started || !browser || !isTauri) return;
	started = true;
	unlisten = await listen(AI_CHANGED, () => {
		void hydrateAi();
	});
}

export function stopAiSync(): void {
	unlisten?.();
	unlisten = undefined;
	started = false;
}

/** Probes the provider with the current settings; does not touch history. */
export async function testAiConnection(): Promise<AiTestResult> {
	if (!isTauri) return { ok: false, message: 'Only available in the desktop app.' };
	try {
		const config = await providerConfig();
		return await invoke<AiTestResult>('ai_test_connection', { config });
	} catch (error) {
		return { ok: false, message: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Streams a completion for `messages`, calling `onDelta` for each token.
 *
 * The prompt history is trimmed to the newest `AI_MAX_CONTEXT_MESSAGES` turns.
 * Resolves with the full text once the stream ends (or throws), so callers can
 * persist it once. The Rust command returns as soon as the stream starts, so
 * this waits on the channel's terminal `done`/`error` event.
 *
 * When the model asks for tools, `toolRunner` executes them and the results are
 * appended as `tool` turns; the loop repeats until the model answers with text
 * or `AI_MAX_TOOL_STEPS` is reached. `options.tools` are the definitions sent
 * on every turn.
 */
export async function streamCompletion(options: {
	messages: AiMessage[];
	task: AiTask;
	instruction?: string;
	onDelta?: (text: string) => void;
	/** Called for each chain-of-thought chunk; never mixed into the answer. */
	onReasoning?: (text: string) => void;
	/** Overrides the configured token cap, e.g. a small one for titles. */
	maxTokensOverride?: number;
	/** Tool definitions to advertise; omit for a plain completion. */
	tools?: AiToolDefinition[];
	/** Runs one tool call; must be supplied when `tools` is set. */
	toolRunner?: (call: AiToolCall) => Promise<ToolResult>;
	/** Reported when a text delta is received, so the caller can drop a spinner. */
	onToolCall?: (call: AiToolCall) => void;
	/** Appended to the transcript for each turn that produced tool calls. */
	onAssistantTools?: (calls: AiToolCall[]) => void;
	/** Appended for each tool result, so the UI can show what ran. */
	onToolResult?: (call: AiToolCall, result: ToolResult) => void;
}): Promise<string> {
	if (!isTauri) throw new Error('AI requests need the desktop app');
	if (!aiReady()) throw new Error('Configure the AI provider first');

	const config = await providerConfig();
	if (options.maxTokensOverride !== undefined) {
		config.maxTokens = options.maxTokensOverride;
	}
	config.tools = options.tools ?? [];

	const history = options.messages.slice(-AI_MAX_CONTEXT_MESSAGES).map((message) => ({ ...message }));

	aiStore.streaming = true;
	try {
		let full = '';
		for (let step = 0; step < AI_MAX_TOOL_STEPS; step += 1) {
			const turn = await runProviderTurn(config, history, options);
			full += turn.text;

			if (!turn.toolCalls.length) return full;
			if (!options.toolRunner) return full;

			// Echo the assistant's tool request, then each result, so the next
			// request is well-formed for both OpenAI and Anthropic.
			history.push({ role: 'assistant', content: turn.text, toolCalls: turn.toolCalls });
			options.onAssistantTools?.(turn.toolCalls);
			for (const call of turn.toolCalls) {
				options.onToolCall?.(call);
				const result = await options.toolRunner(call);
				options.onToolResult?.(call, result);
				history.push({
					role: 'tool',
					content: JSON.stringify(result),
					toolCallId: call.id
				});
			}
		}
		return full;
	} finally {
		aiStore.streaming = false;
	}
}

/** One provider turn: text plus any fully assembled tool calls. */
async function runProviderTurn(
	config: Awaited<ReturnType<typeof providerConfig>>,
	messages: AiMessage[],
	options: { task: AiTask; instruction?: string; onDelta?: (text: string) => void; onReasoning?: (text: string) => void }
): Promise<{ text: string; toolCalls: AiToolCall[] }> {
	const requestId = crypto.randomUUID();
	let text = '';
	const toolCalls: AiToolCall[] = [];
	let settle: (error: Error | null) => void = () => {};
	const finished = new Promise<Error | null>((resolve) => (settle = resolve));

	const channel = new Channel<AiStreamEvent>();
	channel.onmessage = (event) => {
		if (event.kind === 'delta' && event.text) {
			text += event.text;
			options.onDelta?.(event.text);
		} else if (event.kind === 'reasoning' && event.text) {
			options.onReasoning?.(event.text);
		} else if (event.kind === 'tool_call' && event.call) {
			toolCalls.push(event.call);
		} else if (event.kind === 'error') {
			settle(new Error(event.message ?? 'The provider returned an error'));
		} else if (event.kind === 'done') {
			settle(null);
		}
	};

	const request: AiStreamRequest & { config: typeof config } = {
		requestId,
		messages,
		task: options.task,
		instruction: options.instruction,
		config
	};
	await invoke('ai_stream', { request, onEvent: channel });
	const failure = await finished;
	if (failure) throw failure;
	return { text, toolCalls };
}

/** Creates a thread and makes it active, returning its id. */
export async function createThread(title = 'New chat', noteId: string | null = null): Promise<string | null> {
	const id = crypto.randomUUID();
	const ok = await aiRepo.createThread({ id, title, noteId });
	if (!ok) {
		aiStore.error = t('ai.error.newChat');
		return null;
	}
	// A generically named thread is a candidate for an LLM title.
	if (title === 'New chat') markThreadAutoTitle(id);
	aiStore.threads = await aiRepo.listThreads();
	aiStore.activeThreadId = id;
	aiStore.messages = [];
	return id;
}

/**
 * Renames a thread and stops it from being auto-titled, so a background title
 * never overwrites the user's choice.
 */
export async function renameThread(id: string, title: string): Promise<boolean> {
	const ok = await aiRepo.renameThread(id, title);
	if (!ok) {
		aiStore.error = t('ai.error.renameChat');
		return false;
	}
	clearThreadAutoTitle(id);
	aiStore.threads = await aiRepo.listThreads();
	return true;
}

/** Loads a thread's messages into the panel. */
export async function openThread(id: string): Promise<void> {
	aiStore.activeThreadId = id;
	aiStore.messages = await aiRepo.listMessages(id);
}

/** Titles currently being generated in the background, keyed by thread id. */
const titlesInFlight = new Set<string>();

/**
 * Reactive mirror of {@link titlesInFlight}, so the panel can show a spinner
 * on the chip while a title is being generated.
 */
export const titleState = $state<{ generating: string[] }>({ generating: [] });

function setTitleGenerating(threadId: string, generating: boolean): void {
	if (generating) {
		titlesInFlight.add(threadId);
		titleState.generating = [...titlesInFlight];
	} else {
		titlesInFlight.delete(threadId);
		titleState.generating = [...titlesInFlight];
	}
}

/**
 * Threads whose title is still auto-generated, so a background title may
 * replace it. A manual rename removes the id, which is what keeps the model
 * from clobbering a title the user chose.
 */
const autoTitleIds = new Set<string>();

/** Marks a thread as eligible for automatic naming. */
export function markThreadAutoTitle(threadId: string): void {
	autoTitleIds.add(threadId);
}

/** Drops a thread's eligibility (e.g. after a manual rename). */
export function clearThreadAutoTitle(threadId: string): void {
	autoTitleIds.delete(threadId);
}

/** True while a background title generation is still running for `threadId`. */
export function titleGenerating(threadId: string): boolean {
	return titleState.generating.includes(threadId);
}

/**
 * Names a thread from its opening exchange, **in the background**.
 *
 * The chat flow never awaits this: the reply is already visible while the
 * title is generated, so a slow provider cannot stall the conversation. The
 * write is a plain update, and it only runs while the thread is still
 * auto-titled, so a manual rename is never clobbered. Parallel calls for the
 * same thread collapse into one.
 */
export function generateThreadTitle(threadId: string): void {
	if (titlesInFlight.has(threadId) || !autoTitleIds.has(threadId)) return;
	const exchange = aiStore.messages
		.filter((message) => message.role !== 'system')
		.map((message) => ({ role: message.role, content: message.content }));
	if (exchange.length < 2 || !aiReady()) return;

	setTitleGenerating(threadId, true);
	void streamCompletion({
		messages: [titlePrompt(exchange)],
		task: 'title',
		// A little headroom for reasoning models that emit a short preamble.
		maxTokensOverride: 48
	})
		.then(async (raw) => {
			const title = sanitizeThreadTitle(raw);
			if (!title || !autoTitleIds.has(threadId)) return;
			const ok = await aiRepo.renameThread(threadId, title);
			if (!ok) return;
			// Upsert in parallel: refresh the list without blocking anything.
			aiStore.threads = await aiRepo.listThreads();
		})
		.catch(() => {
			/* A failed title is not worth surfacing: the fallback stays. */
		})
		.finally(() => setTitleGenerating(threadId, false));
}

export async function deleteThread(id: string): Promise<boolean> {
	const ok = await aiRepo.deleteThread(id);
	if (!ok) {
		aiStore.error = t('ai.error.deleteChat');
		return false;
	}
	aiStore.threads = await aiRepo.listThreads();
	if (aiStore.activeThreadId === id) {
		aiStore.activeThreadId = null;
		aiStore.messages = [];
	}
	return true;
}

/** Appends a message to the active thread (or a fresh one) and persists it. */
export async function appendMessage(
	role: AiMessage['role'],
	content: string,
	trace?: { reasoning?: string; toolCalls?: AiToolCall[]; toolResults?: Record<string, ToolResult> }
): Promise<AiMessageRecord | null> {
	let threadId = aiStore.activeThreadId;
	if (!threadId) {
		threadId = await createThread(content.slice(0, 48) || 'New chat');
		if (!threadId) return null;
		// The title is just the message stub, so let the model name it later.
		markThreadAutoTitle(threadId);
	}
	const record = await aiRepo.addMessage(threadId, role, content, trace);
	if (!record) {
		aiStore.error = t('ai.error.saveMessage');
		return null;
	}
	aiStore.messages = [...aiStore.messages, record];
	return record;
}
