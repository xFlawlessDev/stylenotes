<script lang="ts">
	import { open } from '@tauri-apps/plugin-dialog';
	import { invoke } from '@tauri-apps/api/core';
	import { FolderOpen, FileText } from '@lucide/svelte';
	import { Button, Field, Switch } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import {
		planImport,
		resolveConflicts,
		type ConflictPolicy,
		type ImportPlan,
		type MarkdownFile
	} from '$lib/content/markdown-import';

	/**
	 * Import markdown (docs/design/constella-features.md #D14).
	 *
	 * Non-destructive: nothing is deleted, and a title conflict is a decision the
	 * user makes here, never a silent merge. The dialog owns the file I/O; the
	 * parsing is pure and the parent owns the actual writes.
	 */
	let {
		open: isOpen = $bindable(false),
		onimport,
		existingTitles,
	}: {
		open?: boolean;
		onimport: (notes: { title: string; folder: string; tags: string[]; body: string }[]) => Promise<boolean>;
		existingTitles: Set<string>;
	} = $props();

	let recursive = $state(true);
	let policy = $state<ConflictPolicy>('skip');
	let plan = $state<ImportPlan | null>(null);
	let picking = $state(false);
	let importing = $state(false);
	let sourcePath = $state('');
	let error = $state<string | null>(null);

	async function pick(kind: 'dir' | 'file') {
		picking = true;
		error = null;
		try {
			const selected = await open(
				kind === 'dir'
					? { directory: true, multiple: false, title: t('importMarkdown.pickFolder') }
					: {
							directory: false,
							multiple: false,
							filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
							title: t('importMarkdown.pickFile')
						}
			);
			if (!selected || typeof selected !== 'string') return;
			sourcePath = selected;
			const files = await invoke<MarkdownFile[]>('import_read_markdown', {
				path: selected,
				recursive,
			});
			plan = planImport(files, existingTitles);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
			plan = null;
		} finally {
			picking = false;
		}
	}

	async function confirm() {
		if (!plan || importing) return;
		importing = true;
		try {
			const notes = resolveConflicts(plan, policy);
			const ok = await onimport(notes);
			if (ok) {
				isOpen = false;
				plan = null;
				sourcePath = '';
			} else {
				error = t('importMarkdown.error.write');
			}
		} finally {
			importing = false;
		}
	}

	function close() {
		if (importing) return;
		isOpen = false;
		plan = null;
		sourcePath = '';
		error = null;
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
		<button
			class="absolute inset-0 cursor-default bg-scrim backdrop-blur-sm"
			aria-label={t('importMarkdown.close')}
			onclick={close}
		></button>
		<div class="glass-solid relative flex w-full max-w-md flex-col gap-4 rounded-2xl p-5">
			<div class="flex flex-col gap-0.5">
				<span class="text-headline-sm font-headline text-on-surface">{t('importMarkdown.title')}</span>
				<span class="text-label-sm font-label text-outline">{t('importMarkdown.subtitle')}</span>
			</div>

			<div class="flex items-center justify-between gap-4">
				<span class="text-body-md font-body text-on-surface">{t('importMarkdown.recursive')}</span>
				<Switch
					checked={recursive}
					label={t('importMarkdown.recursive')}
					onchange={(value) => (recursive = value)}
				/>
			</div>

			<div class="flex gap-2">
				<Button variant="secondary" size="md" disabled={picking} onclick={() => pick('dir')}>
					<FolderOpen size={14} /> {t('importMarkdown.chooseFolder')}
				</Button>
				<Button variant="secondary" size="md" disabled={picking} onclick={() => pick('file')}>
					<FileText size={14} /> {t('importMarkdown.chooseFile')}
				</Button>
			</div>

			{#if error}
				<span class="text-label-sm font-label text-error">{error}</span>
			{/if}

			{#if plan}
				<div
					class="flex flex-col gap-1 rounded-2xl bg-surface-container-lowest/40 p-3 ring-1 ring-inset ring-outline-variant/40"
				>
					<span class="truncate text-label-sm font-label text-outline">{sourcePath}</span>
					<span class="text-body-md font-body text-on-surface">
						{t('importMarkdown.preview', {
							notes: plan.stats.files,
							links: plan.stats.wikilinks,
							tags: plan.stats.tags
						})}
					</span>
					{#if plan.conflicts.length}
						<span class="text-label-sm font-label text-tertiary">
							{t('importMarkdown.conflicts', { count: plan.conflicts.length })}
						</span>
					{/if}
					{#if plan.skipped.length}
						<span class="text-label-sm font-label text-outline">
							{t('importMarkdown.skipped', { count: plan.skipped.length })}
						</span>
					{/if}
				</div>

				{#if plan.conflicts.length}
					<Field label={t('importMarkdown.conflictPolicy')} class="gap-2">
						<div class="flex gap-2">
							<Button
								variant={policy === 'skip' ? 'tonal' : 'outline'}
								size="md"
								onclick={() => (policy = 'skip')}
							>
								{t('importMarkdown.policySkip')}
							</Button>
							<Button
								variant={policy === 'duplicate' ? 'tonal' : 'outline'}
								size="md"
								onclick={() => (policy = 'duplicate')}
							>
								{t('importMarkdown.policyDuplicate')}
							</Button>
						</div>
					</Field>
				{/if}
			{/if}

			<div class="flex justify-end gap-2">
				<Button variant="ghost" size="md" disabled={importing} onclick={close}>
					{t('importMarkdown.cancel')}
				</Button>
				<Button
					variant="primary"
					size="md"
					disabled={!plan || importing || plan.notes.length === 0}
					onclick={confirm}
				>
					{t('importMarkdown.confirm')}
				</Button>
			</div>
		</div>
	</div>
{/if}
