<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Bot, Check, Copy, Loader2, Plus, Sparkles, Trash2, Wrench, X } from '@lucide/svelte';
	import { Button, EmptyState } from '$lib/components/base';
	import AiMessageBody from '$lib/components/note/AiMessageBody.svelte';
	import AiComposer from '$lib/components/note/AiComposer.svelte';
	import type { AiMessage, AiToolCall } from '$lib/content/ai-types';
	import type { WikiSource, WikiClick } from '$lib/content/wiki-links';
	import { mentionPool, mentionedIds } from '$lib/content/ai-mentions';
	import { describeToolCall, executeToolCall, type ToolResult } from '$lib/content/ai-tools';
	import { AI_TOOLS, toolDefinitions, toolLabel } from '$lib/content/ai-tool-schema';
	import { loadToolContext } from '$lib/content/ai-context';
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
	let copiedId = $state<number | null>(null);
	let scrollEl = $state<HTMLElement | null>(null);
	/** Read/write calls shown under the current reply. */
	let toolCalls = $state<{ call: AiToolCall; result?: ToolResult; confirmed?: boolean }[]>([]);
	/** Set while a write call waits for the user to allow or decline it. */
	let pendingWrite = $state<{ call: AiToolCall; resolve: (ok: boolean) => void } | null>(null);

	const ready = $derived(aiReady());
	const turnCount = $derived(aiStore.messages.length);
	const pool = $derived(mentionPool({ notes, tasks }, workspaceId));
	const grant = $derived({ access: aiStore.settings.access, scopes: aiStore.settings.scopes });

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

	async function send(question: string) {
		if (sending) return;
		error = null;
		await appendMessage('user', question);

		const threadId = aiStore.activeThreadId;
		sending = true;
		draft = '';
		toolCalls = [];
		try {
			const context = await loadToolContext();
			const history = buildHistory(question);
			const output = await streamCompletion({
				messages: history,
				task: 'chat',
				tools: toolDefinitions(grant),
				onDelta: (delta) => (draft += delta),
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
			if (output.trim()) await appendMessage('assistant', output);
			if (threadId && aiStore.messages.length === 2) {
				generateThreadTitle(threadId);
			}
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			draft = '';
			sending = false;
			pendingWrite = null;
		}
	}

	/** Records a tool result against its call for the inline list. */
	function markToolResult(call: AiToolCall, result: ToolResult) {
		toolCalls = toolCalls.map((entry) =>
			entry.call.id === call.id ? { ...entry, result } : entry
		);
	}

	/**
	 * Conversation turns sent to the provider, oldest first. The chat is global,
	 * so there is no note-body context; every `@` mention is added instead.
	 */
	function buildHistory(question: string): AiMessage[] {
		const history: AiMessage[] = aiStore.messages.map((message) => ({
			role: message.role,
			content: message.content
		}));
		for (const context of mentionedContext(question)) {
			history.unshift({ role: 'system', content: context });
		}
		return history.length ? history : [{ role: 'user', content: question }];
	}

	/** System blocks for the entities a message mentions. */
	function mentionedContext(message: string): string[] {
		const ids = new Set(mentionedIds(message, pool));
		if (!ids.size) return [];
		return pool
			.filter((entity) => ids.has(`${entity.kind}:${entity.id}`))
			.map((entity) => {
				const body = entity.body?.trim();
				const label = entity.kind === 'task' ? 'task' : 'note';
				const head = `Context — the ${label} "${entity.title}":`;
				return body ? `${head}\n\n${body}` : head;
			});
	}

	async function startNew() {
		await createThread('New chat');
		draft = '';
		error = null;
		toolCalls = [];
	}

	async function removeThread(id: string) {
		await deleteThread(id);
	}

	async function copyMessage(id: number, content: string) {
		try {
			await navigator.clipboard.writeText(content);
			copiedId = id;
			setTimeout(() => (copiedId = null), 1500);
		} catch {
			/* clipboard denied: the text stays visible */
		}
	}
</script>

{#if open}
	<!-- The panel is always a left-side overlay drawer, at every window size,
	     so opening it never squeezes the editor. The scrim closes it. -->
	<button
		class="fixed inset-0 z-40 cursor-default bg-scrim/40"
		aria-label="Close assistant"
		onclick={onclose}
	></button>
	<aside
		class="glass-solid fixed inset-y-2.5 left-2.5 z-40 flex h-[calc(100vh-1.25rem)] w-[min(380px,calc(100vw-1.25rem))] flex-col rounded-2xl shadow-2xl"
		aria-label="AI chat"
	>
		<div class="flex items-center justify-between gap-2 px-4 py-3">
			<div class="flex min-w-0 flex-col">
				<span class="flex items-center gap-1.5 text-headline-sm font-headline text-on-surface">
					<Sparkles size={15} class="text-primary" /> Assistant
				</span>
				<span class="truncate text-label-sm font-label text-outline">
					Search, summarize and edit across every note and task
				</span>
			</div>
			<div class="flex items-center gap-1">
				<Button size="icon-sm" shape="pill" variant="ghost" aria-label="New chat" onclick={() => void startNew()}>
					<Plus size={15} />
				</Button>
				<Button size="icon-sm" shape="pill" variant="ghost" aria-label="Close assistant" onclick={onclose}>
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
								<Loader2 size={11} class="shrink-0 animate-spin" aria-label="Naming chat" />
							{/if}
							<span class="truncate">{thread.title || 'Untitled'}</span>
						</button>
						<Button
							size="icon-xs"
							variant="danger-ghost"
							aria-label="Delete chat"
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
					heading="Ask about your notes"
					title="Summarize, draft, or find something you wrote earlier."
				/>
			{/if}

			{#each aiStore.messages as message (message.id)}
				<div class="flex flex-col gap-1 {message.role === 'user' ? 'items-end' : 'items-start'}">
					{#if message.role === 'assistant'}
						<div
							class="max-w-[92%] rounded-2xl bg-surface-container-lowest/40 px-3.5 py-2.5 text-body-sm font-body text-on-surface"
						>
							<AiMessageBody
								content={message.content}
								onwikilink={followWikiLink}
								class="markdown-body markdown-body--compact"
							/>
						</div>
						<Button
							size="xs"
							variant="ghost"
							class="text-outline"
							onclick={() => void copyMessage(message.id, message.content)}
						>
							{#if copiedId === message.id}<Check size={12} />{:else}<Copy size={12} />{/if}
							{copiedId === message.id ? 'Copied' : 'Copy'}
						</Button>
					{:else}
						<div
							class="emphasis-container max-w-[92%] rounded-2xl px-3.5 py-2.5 text-body-sm font-body whitespace-pre-wrap text-on-primary-container"
						>
							{message.content}
						</div>
					{/if}
				</div>
			{/each}

			{#if sending}
				<div class="flex items-start">
					<div
						class="max-w-[92%] rounded-2xl bg-surface-container-lowest/40 px-3.5 py-2.5 text-body-sm font-body text-on-surface"
					>
						{#if draft}
							<AiMessageBody content={draft} streaming class="markdown-body markdown-body--compact" />
						{:else}
							<Loader2 size={14} class="animate-spin text-outline" />
						{/if}
					</div>
				</div>
			{/if}

			{#if toolCalls.length}
				<div class="flex flex-col gap-1.5 rounded-xl bg-surface-container-lowest/40 p-2.5">
					<span class="flex items-center gap-1.5 text-label-sm font-label text-outline">
						<Wrench size={12} /> Tools
					</span>
					{#each toolCalls as entry (entry.call.id)}
						<div class="flex items-center justify-between gap-2 text-label-sm font-label">
							<span class="truncate text-on-surface-variant">{toolLabel(entry.call.name)}</span>
							{#if entry.result}
								{#if entry.result.ok}
									<span class="shrink-0 text-tertiary">Done</span>
								{:else}
									<span class="shrink-0 truncate text-error" title={entry.result.error}>
										{entry.result.error}
									</span>
								{/if}
							{:else}
								<Loader2 size={12} class="shrink-0 animate-spin text-outline" />
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			{#if pendingWrite}
				<div class="flex flex-col gap-2 rounded-xl bg-tertiary-container/30 p-3">
					<span class="text-label-sm font-label text-on-surface">
						The assistant wants to: {describeToolCall(pendingWrite.call.name, pendingWrite.call.arguments)}
					</span>
					<div class="flex items-center gap-2">
						<Button variant="primary" size="xs" shape="pill" onclick={() => answerWrite(true)}>
							Allow
						</Button>
						<Button variant="secondary" size="xs" shape="pill" onclick={() => answerWrite(false)}>
							Decline
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
