<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { FolderPlus } from '@lucide/svelte';

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
		if (!clean) return 'Give the folder a name.';
		if (labels.some((label) => label.toLowerCase() === clean.toLowerCase()))
			return 'A folder with that name already exists.';
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
				New folder
			</Dialog.Title>
			<Dialog.Description>
				Folders group related notes. You can move notes into it at any time.
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
				<Label for="folder-name" class="text-label-md font-label text-on-surface-variant"
					>Folder name</Label
				>
				<Input
					id="folder-name"
					bind:value
					placeholder="e.g. Research"
					class="glass-well h-9 border-0 text-body-md font-body text-on-surface placeholder:text-outline focus-visible:ring-1 focus-visible:ring-primary/50"
					oninput={() => (touched = true)}
				/>
				{#if error}
					<p class="text-label-sm font-label text-error">{error}</p>
				{/if}
			</div>

			<Dialog.Footer
				class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
			>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit">Create folder</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>