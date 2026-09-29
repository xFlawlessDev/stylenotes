<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/base';
	import { Keyboard, Sparkles } from '@lucide/svelte';
	import { MOD } from '$lib/content/markdown-shortcuts';
	import { t } from '$lib/i18n/index.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const syntax: { example: string; note: string }[] = [
		{ example: '# Heading', note: t('dialogs.markdownGuide.note.heading') },
		{ example: '**Bold**', note: t('dialogs.markdownGuide.note.bold') },
		{ example: '*Italic*', note: t('dialogs.markdownGuide.note.italic') },
		{ example: '~~Strikethrough~~', note: t('dialogs.markdownGuide.note.strikethrough') },
		{ example: '`code`', note: t('dialogs.markdownGuide.note.inlineCode') },
		{ example: '- Item', note: t('dialogs.markdownGuide.note.bullet') },
		{ example: '1. Item', note: t('dialogs.markdownGuide.note.numbered') },
		{ example: '- [ ] Task', note: t('dialogs.markdownGuide.note.checklist') },
		{ example: '> Quote', note: t('dialogs.markdownGuide.note.quote') },
		{ example: '``` code ```', note: t('dialogs.markdownGuide.note.codeBlock') },
		{ example: '---', note: t('dialogs.markdownGuide.note.divider') },
		{ example: '[title](https://example.com)', note: t('dialogs.markdownGuide.note.link') },
		{ example: '[[Note title]]', note: t('dialogs.markdownGuide.note.wikiLink') },
		{ example: '[[Note title|label]]', note: t('dialogs.markdownGuide.note.wikiLinkLabel') },
		{ example: '[[Folder/Note#Heading]]', note: t('dialogs.markdownGuide.note.wikiLinkHeading') },
		{ example: '![[Note title]]', note: t('dialogs.markdownGuide.note.embed') },
		{ example: '![alt](https://example.com/pic.png)', note: t('dialogs.markdownGuide.note.image') },
		{ example: '| a | b |', note: t('dialogs.markdownGuide.note.table') },
	];

	const shortcuts: { keys: string; note: string }[] = [
		{ keys: `${MOD}+B`, note: t('dialogs.markdownGuide.shortcut.bold') },
		{ keys: `${MOD}+I`, note: t('dialogs.markdownGuide.shortcut.italic') },
		{ keys: `${MOD}+Shift+X`, note: t('dialogs.markdownGuide.shortcut.strikethrough') },
		{ keys: `${MOD}+E`, note: t('dialogs.markdownGuide.shortcut.inlineCode') },
		{ keys: `${MOD}+K`, note: t('dialogs.markdownGuide.shortcut.link') },
		{ keys: `${MOD}+Shift+K`, note: t('dialogs.markdownGuide.shortcut.wikiLink') },
		{ keys: `${MOD}+Alt+1…6`, note: t('dialogs.markdownGuide.shortcut.heading') },
		{ keys: `${MOD}+Alt+0`, note: t('dialogs.markdownGuide.shortcut.normalText') },
		{ keys: `${MOD}+Shift+8`, note: t('dialogs.markdownGuide.shortcut.bullet') },
		{ keys: `${MOD}+Shift+7`, note: t('dialogs.markdownGuide.shortcut.numbered') },
		{ keys: `${MOD}+Shift+9`, note: t('dialogs.markdownGuide.shortcut.checklist') },
		{ keys: `${MOD}+Enter`, note: t('dialogs.markdownGuide.shortcut.checkItem') },
		{ keys: `${MOD}+Shift+.`, note: t('dialogs.markdownGuide.shortcut.quote') },
		{ keys: `${MOD}+Shift+C`, note: t('dialogs.markdownGuide.shortcut.codeBlock') },
		{ keys: 'Enter', note: t('dialogs.markdownGuide.shortcut.continueList') },
		{ keys: 'Tab / Shift+Tab', note: t('dialogs.markdownGuide.shortcut.indent') },
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
				>{t('dialogs.markdownGuide.title')}</Dialog.Title
			>
			<Dialog.Description>
				{t('dialogs.markdownGuide.description')}
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex max-h-[55vh] flex-col gap-5 overflow-y-auto pr-1 scrollbar-none">
			<section class="flex flex-col gap-2">
				<h3
					class="flex items-center gap-1.5 text-label-sm font-label tracking-wider text-outline uppercase"
				>
					<Sparkles size={13} /> {t('dialogs.markdownGuide.syntax')}
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
					<Keyboard size={13} /> {t('dialogs.markdownGuide.shortcuts')}
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
			<Button variant="primary" onclick={() => (open = false)}>{t('dialogs.markdownGuide.gotIt')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
