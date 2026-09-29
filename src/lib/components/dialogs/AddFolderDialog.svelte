<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, Field, Input } from '$lib/components/base';
	import { FolderPlus } from '@lucide/svelte';
	import { t } from '$lib/i18n/index.svelte';

	let {
		open = $bindable(false),
		labels = [],
		onsubmit,
	}: {
		open?: boolean;
		labels?: string[];
		onsubmit: (label: string) => void;
	} = $props();

	let value = $state('');
	let touched = $state(false);

	const clean = $derived(value.trim());
	const error = $derived.by(() => {
		if (!touched) return '';
		if (!clean) return t('dialogs.folder.nameRequired');
		if (labels.some((label) => label.toLowerCase() === clean.toLowerCase()))
			return t('dialogs.folder.nameTaken');
		return '';
	});

	$effect(() => {
		if (open) {
			value = '';
			touched = false;
		}
	});

	function submit() {
		touched = true;
		if (!clean) return;
		if (labels.some((label) => label.toLowerCase() === clean.toLowerCase())) return;
		onsubmit(clean);
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-dialog">
		<Dialog.Header>
			<div
				class="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-container text-primary"
			>
				<FolderPlus size={18} />
			</div>
			<Dialog.Title class="text-headline-md font-headline text-on-surface">
				{t('dialogs.folder.title')}
			</Dialog.Title>
			<Dialog.Description>
				{t('dialogs.folder.description')}
			</Dialog.Description>
		</Dialog.Header>

		<form
			class="flex flex-col gap-4"
			onsubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<Field label={t('dialogs.folder.name')} for="folder-name">
				<Input
					id="folder-name"
					bind:value
					size="lg"
					placeholder={t('dialogs.folder.placeholder')}
					invalid={Boolean(error)}
					oninput={() => (touched = true)}
				/>
				{#if error}
					<p class="text-label-sm font-label text-error">{error}</p>
				{/if}
			</Field>

			<Dialog.Footer
				class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
			>
				<Button variant="outline" onclick={() => (open = false)}>{t('dialogs.folder.cancel')}</Button>
				<Button variant="primary" type="submit">{t('dialogs.folder.create')}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>