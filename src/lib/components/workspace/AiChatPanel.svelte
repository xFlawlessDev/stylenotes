<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Bot, Loader2, Plus, Sparkles, Trash2, X } from '@lucide/svelte';
	import { Button, EmptyState } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import AiMessageList from '$lib/components/workspace/AiMessageList.svelte';
	import AiMessageBody from '$lib/components/note/AiMessageBody.svelte';
	import AiReasoning from '$lib/components/ai/AiReasoning.svelte';
	import AiToolTrace from '$lib/components/ai/AiToolTrace.svelte';
	import AiComposer from '$lib/components/note/AiComposer.svelte';
	import AiQuestionCard from '$lib/components/ai/AiQuestionCard.svelte';
	import type { AiMessage, AiToolCall } from '$lib/content/ai-types';
	import type { WikiSource, WikiClick } from '$lib/content/wiki-links';
	import type { AnsweredQuestion, QuestionItem } from '$lib/content/ai-questions';
	import { mentionPool, mentionedIds } from '$lib/content/ai-mentions';
	import { describeToolCall, executeToolCall, type ToolResult } from '$lib/content/ai-tools';
	import { AI_TOOLS, toolDefinitions } from '$lib/content/ai-tool-schema';
	import type { ToolTraceEntry } from '$lib/content/ai-trace';
	import type { CitationEntity, CitationSource } from '$lib/content/ai-citations';
	import { openExternalUrl } from '$lib/content/external-links';
	import { loadToolContext, snapshotNotice } from '$lib/content/ai-context';
	import type { McpSnapshot } from '$lib/content/mcp-types';
	import {
		aiReady,
		aiStore,
		appendMessage,
		createThread,
		deleteThread,
		generateThreadTitle,
		hydrateAi,
		openThread,
		streamCompletion,
		titleGenerating
	} from '$lib/stores/ai.svelte';

	let {
		open = false,
		/** Pools offered by the `@` mention picker. */
		notes = [],
		tasks = [],
		workspaceId,
		onwikilink,
		onclose
	}: {
		open?: boolean;
		notes?: WikiSource[];
		tasks?: WikiSource[];
		workspaceId?: string;
		/** Routes a `[[wiki link]]` clicked in a reply, like the note preview. */
		onwikilink?: (click: WikiClick) => void;
		onclose: () => void;
	} = $props();

	let draft = $state('');
	let sending = $state(false);
	let error = $state<string | null>(null);
	let scrollEl = $state<HTMLElement | null>(null);
	/** Chain of thought for the turn in flight; never persisted on its own. */
	let reasoning = $state('');
	/** Seconds the current thought took, frozen when the stream ends. */
	let reasoningSeconds = $state(0);
	/** Read/write calls shown under the current reply. */
	let toolCalls = $state<ToolTraceEntry[]>([]);
	/** Set while a write call waits for the user to allow or decline it. */
	let pendingWrite = $state<{ call: AiToolCall; resolve: (ok: boolean) => void } | null>(null);
	/** Set while `ask_user_question` waits for the user to answer. */
	let pendingAsk = $state<{
		questions: QuestionItem[];
		resolve: (answers: AnsweredQuestion[]) => void;
	} | null>(null);

	const ready = $derived(aiReady());
	const turnCount = $derived(aiStore.messages.length);
	const pool = $derived(mentionPool({ notes, tasks }, workspaceId));
	const grant = $derived({ access: aiStore.settings.access, scopes: aiStore.settings.scopes });
	/**
	 * Live notes and tasks, so a citation preview shows the current text. Both
	 * pools already carry `id`, `title` and `body`; a task's body is its notes.
	 */
	const citationEntities = $derived<CitationEntity[]>([
		...notes.map((note) => ({ id: note.id, title: note.title, body: note.body })),
		...tasks.map((task) => ({ id: task.id, title: task.title, body: task.body }))
	]);

	onMount(() => {
		void hydrateAi();
	});

	/** Keeps the newest message in view as history grows or tokens arrive. */
	$effect(() => {
		void aiStore.messages.length;
		void draft;
		void toolCalls.length;
		const el = scrollEl;
		if (el) void tick().then(() => (el.scrollTop = el.scrollHeight));
	});

	/** Wiki link clicked in a reply: navigate, then close so the target shows. */
	function followWikiLink(click: WikiClick) {
		onwikilink?.(click);
		onclose();
	}

	/** Asks the user to allow a write; resolves false if they decline. */
	function requestWriteConsent(call: AiToolCall): Promise<boolean> {
		return new Promise((resolve) => {
			pendingWrite = { call, resolve };
		});
	}

	function answerWrite(allow: boolean) {
		const pending = pendingWrite;
		pendingWrite = null;
		pending?.resolve(allow);
	}

	/** Hands the model's questions to the card and waits for the answers. */
	function requestUserAnswers(
		questions: QuestionItem[],
		resolve: (answers: AnsweredQuestion[]) => void
	) {
		pendingAsk = { questions, resolve };
	}

	function answerQuestions(answers: AnsweredQuestion[]) {
		const pending = pendingAsk;
		pendingAsk = null;
		pending?.resolve(answers);
	}

	async function send(question: string) {
		if (sending) return;
		error = null;
		await appendMessage('user', question);

		const threadId = aiStore.activeThreadId;
		sending = true;
		draft = '';
		reasoning = '';
		reasoningSeconds = 0;
		toolCalls = [];
		const startedThinkingAt = Date.now();
		try {
			const context = { ...(await loadToolContext()), ask: requestUserAnswers };
			const history = buildHistory(question, context.snapshot);
			const output = await streamCompletion({
				messages: history,
				task: 'chat',
				tools: toolDefinitions(grant),
				onDelta: (delta) => (draft += delta),
				onReasoning: (delta) => (reasoning += delta),
				onToolCall: (call) => (toolCalls = [...toolCalls, { call }]),
				toolRunner: async (call) => {
					const isWrite = AI_TOOLS.find((tool) => tool.name === call.name)?.kind === 'write';
					// Ask before any write; reads never prompt.
					const confirmed = isWrite ? await requestWriteConsent(call) : false;
					const result = await executeToolCall(context, call.name, call.arguments, { confirmed });
					markToolResult(call, result);
					return result;
				}
			});
			// Freeze the thought's duration before it is persisted.
			if (reasoning) reasoningSeconds = Math.max(1, Math.round((Date.now() - startedThinkingAt) / 1000));
			// The trace is saved with the answer, so reopening the chat still
			// shows what the assistant ran and what it was thinking.
			const trace = {
				reasoning,
				toolCalls: toolCalls.map((entry) => entry.call),
				toolResults: toolResultsById(toolCalls)
			};
			if (output.trim() || trace.toolCalls.length || trace.reasoning) {
				await appendMessage('assistant', output, trace);
			}
			if (threadId && aiStore.messages.length === 2) {
				generateThreadTitle(threadId);
			}
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			draft = '';
			reasoning = '';
			toolCalls = [];
			sending = false;
			pendingWrite = null;
			pendingAsk = null;
		}
	}

	/** Indexes the finished results by call id, for persistence. */
	function toolResultsById(entries: ToolTraceEntry[]): Record<string, ToolResult> {
		const map: Record<string, ToolResult> = {};
		for (const entry of entries) {
			if (entry.result) map[entry.call.id] = entry.result;
		}
		return map;
	}

	/** Records a tool result against its call for the inline list. */
	function markToolResult(call: AiToolCall, result: ToolResult) {
		toolCalls = toolCalls.map((entry) =>
			entry.call.id === call.id ? { ...entry, result } : entry
		);
	}

	/**
	 * A source clicked under a reply, or an inline `[n]` marker.
	 *
	 * A note or task needs a wiki click so the same routing as `[[link]]`
	 * applies; a web source opens in the user's browser. The panel then closes
	 * so the target is visible.
	 */
	function openSource(source: CitationSource) {
		if (source.kind === 'web') {
			void openExternalUrl(source.ref);
		} else {
			onwikilink?.({ target: { id: source.id, kind: source.kind }, targetText: null, candidates: [], heading: null });
		}
		onclose();
	}

	/**
	 * Conversation turns sent to the provider, oldest first, preceded by the
	 * context blocks. The chat is global, so there is no note-body context;
	 * every `@` mention is added instead, alongside the notice that tells the
	 * model when the snapshot itself was trimmed.
	 *
	 * The blocks sit in front because `trimHistory` keeps every system message
	 * whatever its age. Unshifting them here made them the *first* thing a
	 * long thread threw away — the question survived, the context attached to
	 * it did not.
	 */
	function buildHistory(question: string, snapshot: McpSnapshot): AiMessage[] {
		const turns: AiMessage[] = aiStore.messages.map((message) => ({
			role: message.role,
			content: message.content
		}));
		// The question is normally already persisted by `appendMessage`; this
		// keeps a failed write from sending a context-only request.
		if (!turns.length) turns.push({ role: 'user', content: question });

		const blocks: AiMessage[] = [];
		const notice = snapshotNotice(snapshot);
		if (notice) blocks.push({ role: 'system', content: notice });
		for (const context of mentionedContext(question)) {
			blocks.push({ role: 'system', content: context });
		}
		return [...blocks, ...turns];
	}

	/** System blocks for the entities a message mentions. */
	function mentionedContext(message: string): string[] {
		const ids = new Set(mentionedIds(message, pool));
		if (!ids.size) return [];
		return pool
			.filter((entity) => ids.has(`${entity.kind}:${entity.id}`))
			.map((entity) => {
				const body = entity.body?.trim();
				const head = t(entity.kind === 'task' ? 'ai.context.task' : 'ai.context.note', {
					title: entity.title
				});
				return body ? `${head}\n\n${body}` : head;
			});
	}

	async function startNew() {
		await createThread(t('ai.newChat'));
		draft = '';
		error = null;
		reasoning = '';
		reasoningSeconds = 0;
		toolCalls = [];
	}

	async function removeThread(id: string) {
		await deleteThread(id);
	}
</script>

{#if open}
	<!-- The panel is always a left-side overlay drawer, at every window size,
	     so opening it never squeezes the editor. The scrim closes it. -->
	<button
		class="fixed inset-0 z-40 cursor-default bg-scrim/40"
		aria-label={t('ai.closeAssistant')}
		onclick={onclose}
	></button>
	<aside
		class="glass-solid fixed inset-y-2.5 left-2.5 z-40 flex h-[calc(100vh-1.25rem)] w-[min(380px,calc(100vw-1.25rem))] flex-col rounded-2xl shadow-2xl"
		aria-label={t('ai.title')}
	>
		<div class="flex items-center justify-between gap-2 px-4 py-3">
			<div class="flex min-w-0 flex-col">
				<span class="flex items-center gap-1.5 text-headline-sm font-headline text-on-surface">
					<Sparkles size={15} class="text-primary" /> {t('ai.title')}
				</span>
				<span class="truncate text-label-sm font-label text-outline">
					{t('ai.subtitle')}
				</span>
			</div>
			<div class="flex items-center gap-1">
				<Button size="icon-sm" shape="pill" variant="ghost" aria-label={t('ai.newChat')} onclick={() => void startNew()}>
					<Plus size={15} />
				</Button>
				<Button size="icon-sm" shape="pill" variant="ghost" aria-label={t('ai.closeAssistant')} onclick={onclose}>
					<X size={15} />
				</Button>
			</div>
		</div>

		<div class="glass-divider h-px"></div>

		{#if aiStore.threads.length}
			<div class="scrollbar-none flex shrink-0 items-center gap-1 overflow-x-auto px-3 py-2">
				{#each aiStore.threads.slice(0, 8) as thread (thread.id)}
					<div class="group flex shrink-0 items-center">
						<button
							type="button"
							class="flex max-w-[160px] cursor-pointer items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-label-sm font-label {thread.id ===
							aiStore.activeThreadId
								? 'emphasis-container text-on-primary-container'
								: 'glass-chip text-on-surface-variant'}"
							onclick={() => void openThread(thread.id)}
						>
							{#if titleGenerating(thread.id)}
								<Loader2 size={11} class="shrink-0 animate-spin" aria-label={t('ai.namingChat')} />
							{/if}
							<span class="truncate">{thread.title || t('ai.untitled')}</span>
						</button>
						<Button
							size="icon-xs"
							variant="danger-ghost"
							aria-label={t('ai.deleteChat')}
							class="ml-0.5 opacity-0 group-hover:opacity-100"
							onclick={() => void removeThread(thread.id)}
						>
							<Trash2 size={12} />
						</Button>
					</div>
				{/each}
			</div>
		{/if}

		<div bind:this={scrollEl} class="scrollbar-none flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
			{#if !turnCount && !draft}
				<EmptyState
					size="sm"
					icon={Bot}
					heading={t('ai.emptyHeading')}
					title={t('ai.emptyTitle')}
				/>
			{/if}

			<AiMessageList
				messages={aiStore.messages}
				entities={citationEntities}
				onwikilink={followWikiLink}
				onsource={openSource}
			/>

			{#if sending}
				<div class="flex flex-col items-start gap-1">
					{#if reasoning}
						<AiReasoning content={reasoning} streaming seconds={reasoningSeconds} class="w-[92%]" />
					{/if}
					{#if toolCalls.length}
						<AiToolTrace entries={toolCalls} class="w-[92%]" />
					{/if}
					<div
						class="max-w-[92%] rounded-2xl bg-surface-container-lowest/40 px-3.5 py-2.5 text-body-sm font-body text-on-surface"
					>
						{#if draft}
							<AiMessageBody content={draft} streaming class="markdown-body markdown-body--compact" />
						{:else if !reasoning && !toolCalls.length}
							<Loader2 size={14} class="animate-spin text-outline" />
						{/if}
					</div>
				</div>
			{/if}

			{#if pendingAsk}
				<AiQuestionCard questions={pendingAsk.questions} onsubmit={answerQuestions} />
			{/if}

			{#if pendingWrite}
				<div class="flex flex-col gap-2 rounded-xl bg-tertiary-container/30 p-3">
					<span class="text-label-sm font-label text-on-surface">
						{t('ai.wantsTo')} {describeToolCall(pendingWrite.call.name, pendingWrite.call.arguments)}
					</span>
					<div class="flex items-center gap-2">
						<Button variant="primary" size="xs" shape="pill" onclick={() => answerWrite(true)}>
							{t('ai.allow')}
						</Button>
						<Button variant="secondary" size="xs" shape="pill" onclick={() => answerWrite(false)}>
							{t('ai.decline')}
						</Button>
					</div>
				</div>
			{/if}

			{#if error}
				<span class="rounded-xl bg-error-container/30 p-2.5 text-label-sm font-label text-on-error-container">
					{error}
				</span>
			{/if}
		</div>

		<div class="glass-divider h-px"></div>

		<AiComposer
			{ready}
			{sending}
			{notes}
			{tasks}
			{workspaceId}
			onsubmit={(text) => void send(text)}
		/>
	</aside>
{/if}
