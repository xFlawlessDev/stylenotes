<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, Input } from '$lib/components/base';
	import { Check, Folder, FolderCog, Pencil, Plus, Trash2, X } from '@lucide/svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { workspaceChipClass } from '$lib/workspace';

	let {
		open = $bindable(false),
		workspaces,
		activeId,
		oncreate,
		onrename,
		ondelete,
	}: {
		open?: boolean;
		workspaces: { id: string; name: string; color: string }[];
		activeId: string;
		oncreate?: (name: string) => boolean | Promise<boolean>;
		onrename?: (id: string, name: string) => boolean | Promise<boolean>;
		ondelete?: (id: string) => boolean | Promise<boolean>;
	} = $props();

	let createName = $state('');
	let createTouched = $state(false);
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editTouched = $state(false);
	/** Workspace whose delete is waiting for confirmation. */
	let confirmId = $state<string | null>(null);
	let actionError = $state('');
	let busy = $state(false);

	const trimmedCreate = $derived(createName.trim());
	const trimmedEdit = $derived(editName.trim());

	const createError = $derived.by(() => {
		if (!createTouched) return '';
		if (!trimmedCreate) return t('shell.workspace.error.nameRequired');
		if (
			workspaces.some(
				(workspace) => workspace.name.toLowerCase() === trimmedCreate.toLowerCase()
			)
		)
			return t('shell.workspace.error.nameTaken');
		return '';
	});

	const editError = $derived.by(() => {
		if (!editTouched) return '';
		if (!trimmedEdit) return t('shell.workspace.error.nameRequired');
		if (
			workspaces.some(
				(workspace) =>
					workspace.id !== editingId &&
					workspace.name.toLowerCase() === trimmedEdit.toLowerCase()
			)
		)
			return t('shell.workspace.error.nameTaken');
		return '';
	});

	$effect(() => {
		if (open) {
			createName = '';
			createTouched = false;
			editingId = null;
			editName = '';
			editTouched = false;
			confirmId = null;
			actionError = '';
			busy = false;
		}
	});

	async function create(event: SubmitEvent) {
		event.preventDefault();
		createTouched = true;
		if (createError || !oncreate) return;
		actionError = '';
		busy = true;
		const ok = await oncreate(trimmedCreate);
		busy = false;
		if (ok) {
			createName = '';
			createTouched = false;
		} else {
			actionError = t('shell.workspace.error.create');
		}
	}

	function startRename(id: string, name: string) {
		confirmId = null;
		editingId = id;
		editName = name;
		editTouched = false;
		actionError = '';
	}

	async function rename(event: SubmitEvent) {
		event.preventDefault();
		editTouched = true;
		if (editError || !editingId || !onrename) return;
		actionError = '';
		busy = true;
		const ok = await onrename(editingId, trimmedEdit);
		busy = false;
		if (ok) {
			editingId = null;
		} else {
			actionError = t('shell.workspace.error.rename');
		}
	}

	async function remove(id: string) {
		actionError = '';
		if (!ondelete) return;
		busy = true;
		const ok = await ondelete(id);
		busy = false;
		if (ok) {
			confirmId = null;
			editingId = editingId === id ? null : editingId;
		} else {
			actionError = t('shell.workspace.error.delete');
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-dialog sm:max-w-md">
		<Dialog.Header>
			<div
				class="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-container text-primary"
			>
				<FolderCog size={18} />
			</div>
			<Dialog.Title class="text-headline-md font-headline text-on-surface">
				{t('shell.workspace.manageTitle')}
			</Dialog.Title>
			<Dialog.Description>
				{t('shell.workspace.manageDescription')}
			</Dialog.Description>
		</Dialog.Header>

		<form class="flex items-center gap-2" onsubmit={create}>
			<Input
				bind:value={createName}
				size="md"
				class="min-w-0 flex-1"
				placeholder={t('shell.workspace.newPlaceholder')}
				aria-label={t('shell.workspace.newLabel')}
				invalid={Boolean(createError)}
				oninput={() => (createTouched = true)}
			/>
			<Button type="submit" variant="primary" disabled={busy}>
				<Plus size={15} />
				{t('shell.workspace.add')}
			</Button>
		</form>
		{#if createError}
			<p class="-mt-2 text-label-sm font-label text-error">{createError}</p>
		{/if}

		<ul class="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
			{#each workspaces as workspace (workspace.id)}
				{@const tint = workspaceChipClass(workspace.color)}
				<li
					class="flex items-center gap-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest/40 px-2.5 py-2"
				>
					{#if editingId === workspace.id}
						<div class="flex min-w-0 flex-1 flex-col gap-1">
							<form class="flex min-w-0 items-center gap-2" onsubmit={rename}>
								<span class="flex size-7 shrink-0 items-center justify-center rounded-lg {tint}">
									<Folder size={14} />
								</span>
								<Input
									bind:value={editName}
									size="sm"
									class="min-w-0 flex-1"
									aria-label={t('shell.workspace.nameLabel')}
									invalid={Boolean(editError)}
									oninput={() => (editTouched = true)}
								/>
								<Button
									type="submit"
									size="icon-sm"
									variant="tonal"
									aria-label={t('shell.workspace.saveName')}
									disabled={busy}><Check size={14} /></Button
								>
								<Button
									type="button"
									bare
									size="icon-sm"
									aria-label={t('shell.workspace.cancelRename')}
									onclick={() => (editingId = null)}><X size={14} /></Button
								>
							</form>
							{#if editError}
								<p class="text-label-sm font-label text-error">{editError}</p>
							{/if}
						</div>
					{:else if confirmId === workspace.id}
						<div class="flex min-w-0 flex-1 items-center gap-2">
							<p class="min-w-0 flex-1 truncate text-body-sm font-body text-on-surface-variant">
								{t('shell.workspace.deleteQuestion', { name: workspace.name })}
							</p>
							<Button size="xs" variant="outline" onclick={() => (confirmId = null)}>{t('common.cancel')}</Button>
							<Button size="xs" variant="danger" disabled={busy} onclick={() => remove(workspace.id)}>
								{t('common.delete')}
							</Button>
						</div>
					{:else}
						<span class="flex size-7 shrink-0 items-center justify-center rounded-lg {tint}">
							<Folder size={14} />
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-body-md font-body text-on-surface">{workspace.name}</p>
							<p class="text-label-sm font-label text-outline">
								{workspace.id === activeId ? t('shell.workspace.active') : t('shell.workspace.member')}
							</p>
						</div>
						<Button
							size="icon-sm"
							aria-label={t('shell.workspace.rename', { name: workspace.name })}
							onclick={() => startRename(workspace.id, workspace.name)}
						>
							<Pencil size={14} />
						</Button>
						<Button
							size="icon-sm"
							variant="danger-ghost"
							aria-label={t('shell.workspace.delete', { name: workspace.name })}
							disabled={workspaces.length < 2 || busy}
							onclick={() => (confirmId = workspace.id)}
						>
							<Trash2 size={14} />
						</Button>
					{/if}
				</li>
			{/each}
		</ul>

		{#if actionError}
			<p class="text-label-sm font-label text-error">{actionError}</p>
		{/if}

		<Dialog.Footer
			class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
		>
			<Button variant="outline" onclick={() => (open = false)}>{t('shell.workspace.close')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
