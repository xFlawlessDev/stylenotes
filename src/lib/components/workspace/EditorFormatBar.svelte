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

	type Tool = {
		id: EditorCommand;
		label: string;
		shortcut?: string;
		icon: Component;
	};

	const GROUPS: Tool[][] = [
		[
			{ id: 'bold', label: 'Bold', shortcut: `${MOD}+B`, icon: Bold },
			{ id: 'italic', label: 'Italic', shortcut: `${MOD}+I`, icon: Italic },
			{ id: 'strikethrough', label: 'Strikethrough', shortcut: `${MOD}+Shift+X`, icon: Strikethrough },
			{ id: 'code', label: 'Inline code', shortcut: `${MOD}+E`, icon: Code2 },
			{ id: 'link', label: 'Link', shortcut: `${MOD}+K`, icon: Link },
			{ id: 'wikilink', label: 'Wiki link', shortcut: `${MOD}+Shift+K`, icon: SquareLibrary },
			{ id: 'image', label: 'Image', icon: Image },
		],
		[
			{ id: 'heading1', label: 'Heading 1', shortcut: `${MOD}+Alt+1`, icon: Heading1 },
			{ id: 'heading2', label: 'Heading 2', shortcut: `${MOD}+Alt+2`, icon: Heading2 },
			{ id: 'heading3', label: 'Heading 3', shortcut: `${MOD}+Alt+3`, icon: Heading3 },
			{ id: 'bullet', label: 'Bulleted list', shortcut: `${MOD}+Shift+8`, icon: List },
			{ id: 'numbered', label: 'Numbered list', shortcut: `${MOD}+Shift+7`, icon: ListOrdered },
			{ id: 'checklist', label: 'Checklist', shortcut: `${MOD}+Shift+9`, icon: ListChecks },
			{ id: 'checked', label: 'Check / uncheck item', shortcut: `${MOD}+Enter`, icon: SquareCheck },
			{ id: 'quote', label: 'Quote', shortcut: `${MOD}+Shift+.`, icon: Quote },
			{ id: 'codeblock', label: 'Code block', shortcut: `${MOD}+Shift+C`, icon: SquareCode },
			{ id: 'table', label: 'Table', icon: Table },
			{ id: 'divider', label: 'Divider', icon: Minus },
		],
	];

	const buttonClass = 'shrink-0 rounded-lg';

	let {
		oncommand,
		onguide,
	}: {
		oncommand: (command: EditorCommand) => void;
		onguide?: () => void;
	} = $props();
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
						<Button {...props} size="icon-sm" class={buttonClass} aria-label={tool.label} onclick={() => oncommand(tool.id)}>
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
					aria-label="Formatting guide"
					onclick={() => onguide?.()}
				>
					<CircleHelp size={16} />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>Formatting guide</Tooltip.Content>
	</Tooltip.Root>
</div>
