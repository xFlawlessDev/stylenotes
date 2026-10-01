<script lang="ts">
	import type { Component } from 'svelte';
	import {
		Bold,
		CircleHelp,
		Code2,
		Heading1,
		Heading2,
		Heading3,
		Image,
		Italic,
		Link,
		List,
		ListChecks,
		ListOrdered,
		Minus,
		Paperclip,
		Quote,
		SquareCheck,
		SquareCode,
		SquareLibrary,
		Strikethrough,
		Table,
	} from '@lucide/svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Button } from '$lib/components/base';
	import type { EditorCommand } from '$lib/content/markdown-editor';
	import { MOD } from '$lib/content/markdown-shortcuts';
	import { t } from '$lib/i18n/index.svelte';

	/** `image`/`attach` are picker actions, not text transforms. */
	type ToolId = EditorCommand | 'attach';
	type Tool = {
		id: ToolId;
		label: string;
		shortcut?: string;
		icon: Component;
	};

	const GROUPS: Tool[][] = [
		[
			{ id: 'bold', label: t('editor.format.bold'), shortcut: `${MOD}+B`, icon: Bold },
			{ id: 'italic', label: t('editor.format.italic'), shortcut: `${MOD}+I`, icon: Italic },
			{ id: 'strikethrough', label: t('editor.format.strikethrough'), shortcut: `${MOD}+Shift+X`, icon: Strikethrough },
			{ id: 'code', label: t('editor.format.inlineCode'), shortcut: `${MOD}+E`, icon: Code2 },
			{ id: 'link', label: t('editor.format.link'), shortcut: `${MOD}+K`, icon: Link },
			{ id: 'wikilink', label: t('editor.format.wikiLink'), shortcut: `${MOD}+Shift+K`, icon: SquareLibrary },
			{ id: 'image', label: t('editor.format.image'), icon: Image },
			{ id: 'attach', label: t('editor.format.attach'), icon: Paperclip },
		],
		[
			{ id: 'heading1', label: t('editor.format.heading1'), shortcut: `${MOD}+Alt+1`, icon: Heading1 },
			{ id: 'heading2', label: t('editor.format.heading2'), shortcut: `${MOD}+Alt+2`, icon: Heading2 },
			{ id: 'heading3', label: t('editor.format.heading3'), shortcut: `${MOD}+Alt+3`, icon: Heading3 },
			{ id: 'bullet', label: t('editor.format.bullet'), shortcut: `${MOD}+Shift+8`, icon: List },
			{ id: 'numbered', label: t('editor.format.numbered'), shortcut: `${MOD}+Shift+7`, icon: ListOrdered },
			{ id: 'checklist', label: t('editor.format.checklist'), shortcut: `${MOD}+Shift+9`, icon: ListChecks },
			{ id: 'checked', label: t('editor.format.checked'), shortcut: `${MOD}+Enter`, icon: SquareCheck },
			{ id: 'quote', label: t('editor.format.quote'), shortcut: `${MOD}+Shift+.`, icon: Quote },
			{ id: 'codeblock', label: t('editor.format.codeblock'), shortcut: `${MOD}+Shift+C`, icon: SquareCode },
			{ id: 'table', label: t('editor.format.table'), icon: Table },
			{ id: 'divider', label: t('editor.format.divider'), icon: Minus },
		],
	];

	const buttonClass = 'shrink-0 rounded-lg';

	let {
		oncommand,
		onattach,
		onguide,
	}: {
		oncommand: (command: EditorCommand) => void;
		/** Pick a file (or image) from disk and attach it. */
		onattach?: (kind: 'image' | 'file') => void;
		onguide?: () => void;
	} = $props();

	function activate(tool: Tool) {
		if (tool.id === 'image') onattach?.('image');
		else if (tool.id === 'attach') onattach?.('file');
		else oncommand(tool.id);
	}
</script>

<div
	class="glass-well mx-6 flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-xl px-1.5 py-1 text-on-surface-variant scrollbar-none"
>
	{#each GROUPS as group, index}
		{#if index > 0}
			<span class="mx-1 h-4 w-px shrink-0 bg-outline-variant/40"></span>
		{/if}
		{#each group as tool (tool.id)}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button {...props} size="icon-sm" class={buttonClass} aria-label={tool.label} onclick={() => activate(tool)}>
							<tool.icon size={16} />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>
					{tool.label}
					{#if tool.shortcut}
						<kbd data-slot="kbd" class="font-code text-[10px] opacity-70">{tool.shortcut}</kbd>
					{/if}
				</Tooltip.Content>
			</Tooltip.Root>
		{/each}
	{/each}

	<span class="mx-1 h-4 w-px shrink-0 bg-outline-variant/40"></span>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					size="icon-sm"
					class={buttonClass}
					aria-label={t('editor.format.guide')}
					onclick={() => onguide?.()}
				>
					<CircleHelp size={16} />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{t('editor.format.guide')}</Tooltip.Content>
	</Tooltip.Root>
</div>
