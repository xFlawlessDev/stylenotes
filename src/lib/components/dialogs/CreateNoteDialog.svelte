<script lang="ts">
	import { tick } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, Field, Input, Select, Textarea } from '$lib/components/base';
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
			<Field label="Title" hint="optional" for="note-title">
				<Input
					id="note-title"
					bind:ref={titleEl}
					bind:value={title}
					size="lg"
					placeholder="Untitled note"
				/>
			</Field>

			<Field label="Folder">
				<Select
					label="Folder"
					options={options.map((option) => ({ value: option.id, label: option.label }))}
					bind:value={folder}
				/>
			</Field>

			<Field label="Start writing" hint="optional" for="note-body">
				<Textarea
					id="note-body"
					bind:value={body}
					rows={3}
					placeholder="A first thought, a to-do, anything."
				/>
			</Field>

			{#if confirming}
				<div
					class="flex items-center gap-2 rounded-xl bg-error-container/25 px-3 py-2 text-label-sm font-label text-error"
				>
					<AlertTriangle size={14} class="shrink-0" />
					<span class="flex-1">Discard this draft? Your text will be lost.</span>
					<Button size="xs" onclick={() => (confirming = false)}>Keep editing</Button>
					<Button
						variant="ghost"
						size="xs"
						class="font-semibold text-error hover:bg-error-container/40"
						onclick={() => (open = false)}
					>
						Discard
					</Button>
				</div>
			{/if}

			<Dialog.Footer
				class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
			>
				<Button variant="outline" onclick={requestClose}>Cancel</Button>
				<Button variant="primary" type="submit">
					Create note
					<kbd class="ml-1.5 text-[10px] opacity-70">Ctrl ↵</kbd>
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>