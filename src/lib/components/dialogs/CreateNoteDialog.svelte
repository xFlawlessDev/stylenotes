<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { FilePlus2 } from '@lucide/svelte';
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
	let touched = $state(false);

	const options = $derived(folders.filter((item) => item.id !== 'all'));
	const error = $derived(touched && !title.trim() ? 'Give the note a title to continue.' : '');

	$effect(() => {
		if (open) {
			title = '';
			body = '';
			touched = false;
			folder = options.find((item) => item.id === 'personal')?.id ?? options[0]?.id ?? 'personal';
		}
	});

	function submit() {
		touched = true;
		if (!title.trim()) return;
		onsubmit({ title: title.trim(), folder, body });
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-dialog">
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
				<Label for="note-title" class="text-label-md font-label text-on-surface-variant">Title</Label>
				<Input
					id="note-title"
					bind:value={title}
					placeholder="e.g. Weekly review"
					class="glass-well h-9 border-0 text-body-md font-body text-on-surface placeholder:text-outline focus-visible:ring-1 focus-visible:ring-primary/50"
					oninput={() => (touched = true)}
				/>
				{#if error}
					<p class="text-label-sm font-label text-error">{error}</p>
				{/if}
			</div>

			<div class="flex flex-col gap-2">
				<Label for="note-folder" class="text-label-md font-label text-on-surface-variant"
					>Folder</Label
				>
				<select
					id="note-folder"
					bind:value={folder}
					class="glass-well h-9 w-full cursor-pointer rounded-lg px-3 text-body-md font-body text-on-surface focus:border-primary/50 focus:outline-none"
				>
					{#each options as option (option.id)}
						<option class="bg-surface-container text-on-surface" value={option.id}>
							{option.label}
						</option>
					{/each}
				</select>
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

			<Dialog.Footer
				class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
			>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit">Create note</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>