<script lang="ts">
	import { tick } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import SelectField from '$lib/components/fields/SelectField.svelte';
	import { AlertTriangle, FilePlus2 } from '@lucide/svelte';
	import type { Folder } from '$lib/stores/notes';

	let {
		open = $bindable(false),
		folders,
		onsubmit,
	}: {
		open?: boolean;
		folders: Folder[];
		onsubmit: (note: { title: string; folder: string; body: string }) => void;
	} = $props();

	let title = $state('');
	let folder = $state('personal');
	let body = $state('');
	let confirming = $state(false);
	let titleEl = $state<HTMLInputElement | null>(null);

	const options = $derived(folders.filter((item) => item.id !== 'all'));
	const hasDraft = $derived(title.trim().length > 0 || body.trim().length > 0);

	$effect(() => {
		if (open) {
			title = '';
			body = '';
			confirming = false;
			folder = options.find((item) => item.id === 'personal')?.id ?? options[0]?.id ?? 'personal';
			void tick().then(() => titleEl?.focus());
		}
	});

	function submit() {
		onsubmit({ title: title.trim(), folder, body });
		open = false;
	}

	function requestClose() {
		if (hasDraft && !confirming) {
			confirming = true;
			return;
		}
		open = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			submit();
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="glass-dialog"
		showCloseButton={false}
		onkeydown={onKeydown}
		onEscapeKeydown={(event) => {
			event.preventDefault();
			requestClose();
		}}
		onInteractOutside={(event) => {
			if (hasDraft) event.preventDefault();
		}}
	>
		<Dialog.Header>
			<div
				class="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-container text-primary"
			>
				<FilePlus2 size={18} />
			</div>
			<Dialog.Title class="text-headline-md font-headline text-on-surface">
				Create a new note
			</Dialog.Title>
			<Dialog.Description>
				Name the note and choose where it should live. You can change everything later.
			</Dialog.Description>
		</Dialog.Header>

		<form
			class="flex flex-col gap-4"
			onsubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<div class="flex flex-col gap-2">
				<Label for="note-title" class="text-label-md font-label text-on-surface-variant"
					>Title <span class="text-outline">(optional)</span></Label
				>
				<Input
					id="note-title"
					bind:ref={titleEl}
					bind:value={title}
					placeholder="Untitled note"
					class="glass-well h-9 border-0 text-body-md font-body text-on-surface placeholder:text-outline focus-visible:ring-1 focus-visible:ring-primary/50"
				/>
			</div>

			<div class="flex flex-col gap-2">
				<Label class="text-label-md font-label text-on-surface-variant"
					>Folder</Label
				>
				<SelectField
					label="Folder"
					options={options.map((option) => ({ value: option.id, label: option.label }))}
					bind:value={folder}
				/>
			</div>

			<div class="flex flex-col gap-2">
				<Label for="note-body" class="text-label-md font-label text-on-surface-variant"
					>Start writing <span class="text-outline">(optional)</span></Label
				>
				<textarea
					id="note-body"
					bind:value={body}
					rows="3"
					placeholder="A first thought, a to-do, anything."
					class="glass-well w-full resize-none rounded-lg px-3 py-2 text-body-sm font-body text-on-surface placeholder:text-outline focus:border-primary/50 focus:outline-none"
				></textarea>
			</div>

			{#if confirming}
				<div
					class="flex items-center gap-2 rounded-xl bg-error-container/25 px-3 py-2 text-label-sm font-label text-error"
				>
					<AlertTriangle size={14} class="shrink-0" />
					<span class="flex-1">Discard this draft? Your text will be lost.</span>
					<button
						type="button"
						class="rounded-md px-2 py-1 text-on-surface-variant transition-colors hover:text-on-surface"
						onclick={() => (confirming = false)}
					>
						Keep editing
					</button>
					<button
						type="button"
						class="rounded-md px-2 py-1 font-semibold text-error transition-colors hover:brightness-110"
						onclick={() => (open = false)}
					>
						Discard
					</button>
				</div>
			{/if}

			<Dialog.Footer
				class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
			>
				<Button type="button" variant="outline" onclick={requestClose}>Cancel</Button>
				<Button type="submit">
					Create note
					<kbd class="ml-1.5 text-[10px] opacity-70">Ctrl ↵</kbd>
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>