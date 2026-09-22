<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/base';
	import { Keyboard, Sparkles } from '@lucide/svelte';
	import { MOD } from '$lib/content/markdown-shortcuts';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const syntax: { example: string; note: string }[] = [
		{ example: '# Heading', note: 'Section title (use ## and ### for smaller headings)' },
		{ example: '**Bold**', note: 'Strong emphasis' },
		{ example: '*Italic*', note: 'Light emphasis' },
		{ example: '~~Strikethrough~~', note: 'Cross something out' },
		{ example: '`code`', note: 'Code inside a sentence' },
		{ example: '- Item', note: 'Bulleted list' },
		{ example: '1. Item', note: 'Numbered list' },
		{ example: '- [ ] Task', note: 'Checklist you can tick in Preview' },
		{ example: '> Quote', note: 'Blockquote' },
		{ example: '``` code ```', note: 'Code block' },
		{ example: '---', note: 'Divider line' },
		{ example: '[title](https://example.com)', note: 'Link' },
		{ example: '![alt](https://example.com/pic.png)', note: 'Image' },
		{ example: '| a | b |', note: 'Table' },
	];

	const shortcuts: { keys: string; note: string }[] = [
		{ keys: `${MOD}+B`, note: 'Bold' },
		{ keys: `${MOD}+I`, note: 'Italic' },
		{ keys: `${MOD}+Shift+X`, note: 'Strikethrough' },
		{ keys: `${MOD}+E`, note: 'Inline code' },
		{ keys: `${MOD}+K`, note: 'Link' },
		{ keys: `${MOD}+Alt+1…6`, note: 'Heading levels' },
		{ keys: `${MOD}+Alt+0`, note: 'Normal text' },
		{ keys: `${MOD}+Shift+8`, note: 'Bulleted list' },
		{ keys: `${MOD}+Shift+7`, note: 'Numbered list' },
		{ keys: `${MOD}+Shift+9`, note: 'Checklist' },
		{ keys: `${MOD}+Enter`, note: 'Check / uncheck item' },
		{ keys: `${MOD}+Shift+.`, note: 'Quote' },
		{ keys: `${MOD}+Shift+C`, note: 'Code block' },
		{ keys: 'Enter', note: 'Continue the current list or checklist' },
		{ keys: 'Tab / Shift+Tab', note: 'Indent or outdent list lines' },
	];
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-dialog max-w-xl">
		<Dialog.Header>
			<div
				class="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-container text-secondary"
			>
				<Sparkles size={18} />
			</div>
			<Dialog.Title class="text-headline-md font-headline text-on-surface"
				>Formatting guide</Dialog.Title
			>
			<Dialog.Description>
				Write normally and use the toolbar or these shortcuts. Markdown is applied for you.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex max-h-[55vh] flex-col gap-5 overflow-y-auto pr-1 scrollbar-none">
			<section class="flex flex-col gap-2">
				<h3
					class="flex items-center gap-1.5 text-label-sm font-label tracking-wider text-outline uppercase"
				>
					<Sparkles size={13} /> Syntax
				</h3>
				<ul class="flex flex-col gap-1.5">
					{#each syntax as item (item.example)}
						<li class="flex items-center gap-3 text-body-sm font-body">
							<code
								class="glass-well shrink-0 rounded-lg px-2 py-1 text-code-sm font-code text-secondary"
								>{item.example}</code
							>
							<span class="text-on-surface-variant">{item.note}</span>
						</li>
					{/each}
				</ul>
			</section>

			<section class="flex flex-col gap-2">
				<h3
					class="flex items-center gap-1.5 text-label-sm font-label tracking-wider text-outline uppercase"
				>
					<Keyboard size={13} /> Shortcuts
				</h3>
				<ul class="grid gap-1.5 sm:grid-cols-2">
					{#each shortcuts as item (item.keys)}
						<li class="flex items-center justify-between gap-3 text-body-sm font-body">
							<span class="text-on-surface-variant">{item.note}</span>
							<kbd
								class="glass-well shrink-0 rounded-md px-2 py-1 text-code-sm font-code text-on-surface"
								>{item.keys}</kbd
							>
						</li>
					{/each}
				</ul>
			</section>
		</div>

		<Dialog.Footer
			class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
		>
			<Button variant="primary" onclick={() => (open = false)}>Got it</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
