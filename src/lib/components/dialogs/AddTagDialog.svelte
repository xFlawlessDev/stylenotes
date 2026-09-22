<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, Field, Input } from '$lib/components/base';
	import { Tag } from '@lucide/svelte';

	let {
		open = $bindable(false),
		existing = [],
		onsubmit,
	}: {
		open?: boolean;
		existing?: string[];
		onsubmit: (tag: string) => void;
	} = $props();

	let value = $state('');
	let touched = $state(false);

	const clean = $derived(value.replace(/^#/, '').trim());
	const error = $derived.by(() => {
		if (!touched) return '';
		if (!clean) return 'Enter a tag name.';
		if (existing.includes(clean)) return 'That tag is already on this note.';
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
		if (!clean || existing.includes(clean)) return;
		onsubmit(clean);
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-dialog">
		<Dialog.Header>
			<div
				class="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-container text-secondary"
			>
				<Tag size={18} />
			</div>
			<Dialog.Title class="text-headline-md font-headline text-on-surface">Add a tag</Dialog.Title>
			<Dialog.Description>
				Tags help you find related notes later. Keep them short and reusable.
			</Dialog.Description>
		</Dialog.Header>

		<form
			class="flex flex-col gap-4"
			onsubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<Field label="Tag" for="tag-name">
				<Input
					id="tag-name"
					bind:value
					size="lg"
					placeholder="e.g. Research"
					invalid={Boolean(error)}
					oninput={() => (touched = true)}
				/>
				{#if error}
					<p class="text-label-sm font-label text-error">{error}</p>
				{/if}
			</Field>

			{#if existing.length}
				<div class="flex flex-wrap gap-1.5">
					{#each existing as tag (tag)}
						<span class="glass-chip rounded-full px-2.5 py-1 text-code-sm font-code text-outline"
							>#{tag}</span
						>
					{/each}
				</div>
			{/if}

			<Dialog.Footer
				class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
			>
				<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button variant="primary" type="submit">Add tag</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>