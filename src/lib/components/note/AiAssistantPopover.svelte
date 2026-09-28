<script lang="ts" module>
	import { computePosition, flip, offset, shift } from '@floating-ui/dom';

	/** Anchors the popover under the AI button, flipping when it would clip. */
	export async function positionAiPopover(
		anchor: HTMLElement,
		popover: HTMLElement
	): Promise<void> {
		const { x, y } = await computePosition(anchor, popover, {
			placement: 'bottom-end',
			middleware: [offset(6), flip(), shift({ padding: 8 })]
		});
		popover.style.left = `${x}px`;
		popover.style.top = `${y}px`;
	}
</script>

<script lang="ts">
	import { Check, Copy, Loader2, RotateCcw, Sparkles, Wand2 } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { Button, Textarea } from '$lib/components/base';
	import {
		AI_QUICK_ACTIONS,
		availableApplyModes,
		buildActionMessage,
		type AiApplyMode,
		type AiQuickAction
	} from '$lib/content/ai-assistant';
	import type { AiTask } from '$lib/content/ai-types';
	import { aiReady, hydrateAi, streamCompletion } from '$lib/stores/ai.svelte';
	import AiMessageBody from '$lib/components/note/AiMessageBody.svelte';

	let {
		anchor,
		text,
		hasSelection,
		onselect,
		onclose
	}: {
		/** The button the popover floats under. */
		anchor: HTMLElement | null;
		/** The selection, or the whole body when there is no selection. */
		text: string;
		hasSelection: boolean;
		/** Called with the generated text and the chosen apply mode. */
		onselect: (generated: string, mode: AiApplyMode) => void;
		onclose: () => void;
	} = $props();

	let action = $state<AiTask | null>(null);
	let instruction = $state('');
	let output = $state('');
	let running = $state(false);
	let error = $state<string | null>(null);
	let copied = $state(false);
	let popoverEl = $state<HTMLDivElement | null>(null);

	const modes = $derived(availableApplyModes(hasSelection));
	const ready = $derived(aiReady());

	onMount(() => {
		void hydrateAi();
	});

	$effect(() => {
		const target = anchor;
		const el = popoverEl;
		if (target && el) void positionAiPopover(target, el);
	});

	async function run(next: AiQuickAction) {
		if (!ready) {
			error = 'Configure the AI provider in Settings first.';
			return;
		}
		action = next.id;
		output = '';
		error = null;
		if (next.needsInstruction && !instruction.trim()) return;

		running = true;
		try {
			const message = buildActionMessage(next.id, text, instruction);
			await streamCompletion({
				messages: [message],
				task: next.id,
				instruction: next.needsInstruction ? instruction : undefined,
				onDelta: (delta) => (output += delta)
			});
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			running = false;
		}
	}

	function reset() {
		action = null;
		output = '';
		error = null;
		instruction = '';
	}

	async function apply(mode: AiApplyMode) {
		if (mode === 'copy') {
			try {
				await navigator.clipboard.writeText(output);
				copied = true;
				setTimeout(() => (copied = false), 1500);
			} catch {
				/* clipboard denied: the text stays visible to copy manually */
			}
			return;
		}
		onselect(output, mode);
	}
</script>

<div
	bind:this={popoverEl}
	class="glass-solid fixed z-[70] flex max-h-[420px] w-[360px] flex-col gap-3 overflow-y-auto rounded-2xl border border-outline-variant/30 p-3 shadow-xl"
	role="dialog"
	aria-label="AI assistant"
>
	<div class="flex items-center justify-between gap-2">
		<span class="flex items-center gap-1.5 text-label-md font-label text-on-surface">
			<Sparkles size={14} class="text-primary" /> AI assistant
		</span>
		<Button size="icon" shape="pill" variant="ghost" aria-label="Close" onclick={onclose}>
			<span class="text-outline">✕</span>
		</Button>
	</div>

	{#if !ready}
		<p class="rounded-xl bg-error-container/30 p-2.5 text-label-sm font-label text-on-error-container">
			The AI assistant is off. Enable it and add a key in Settings → AI.
		</p>
	{:else if !action}
		<div class="flex flex-col gap-1.5">
			{#each AI_QUICK_ACTIONS as item (item.id)}
				<button
					type="button"
					class="flex cursor-pointer flex-col items-start rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-container/60"
					onclick={() => void run(item)}
				>
					<span class="text-body-md font-body text-on-surface">{item.label}</span>
					<span class="text-label-sm font-label text-outline">{item.description}</span>
				</button>
			{/each}
		</div>
	{:else}
		{#if action === 'custom' && !output && !running}
			<Textarea
				variant="well"
				placeholder="e.g. Turn this into a checklist"
				aria-label="Custom instruction"
				class="min-h-[64px] text-body-md"
				bind:value={instruction}
			/>
			<Button
				variant="primary"
				size="md"
				shape="tile"
				block
				class="justify-center"
				disabled={!instruction.trim()}
				onclick={() => void run(AI_QUICK_ACTIONS[3])}
			>
				<Wand2 size={14} /> Generate
			</Button>
		{/if}

		{#if running || output || error}
			<div class="glass-well flex flex-col gap-2 rounded-xl p-2.5">
				{#if running && !output}
					<span class="flex items-center gap-1.5 text-label-sm font-label text-outline">
						<Loader2 size={13} class="animate-spin" /> Thinking…
					</span>
				{:else if error}
					<span class="text-label-sm font-label text-error">{error}</span>
				{:else}
					<AiMessageBody
						content={output}
						streaming={running}
						class="markdown-body markdown-body--compact text-body-sm"
					/>
				{/if}
			</div>
		{/if}

		<div class="flex flex-wrap items-center gap-1.5">
			{#each modes as mode (mode)}
				<Button
					variant={mode === 'replace' ? 'primary' : 'secondary'}
					size="xs"
					shape="pill"
					disabled={running || !output}
					onclick={() => void apply(mode)}
				>
					{#if mode === 'copy' && copied}<Check size={12} />{:else if mode === 'copy'}<Copy size={12} />{/if}
					{mode === 'replace' ? 'Replace' : mode === 'insert' ? 'Insert' : copied ? 'Copied' : 'Copy'}
				</Button>
			{/each}
			<Button variant="ghost" size="xs" shape="pill" onclick={reset}>
				<RotateCcw size={12} /> Start over
			</Button>
		</div>
	{/if}
</div>
