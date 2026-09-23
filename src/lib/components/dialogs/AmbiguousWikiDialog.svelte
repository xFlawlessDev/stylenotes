<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/base';
	import { wikiEntityLabel, type WikiEntity } from '$lib/content/wiki-links';

	let {
		open = $bindable(false),
		entities = [],
		heading = null,
		onselect,
	}: {
		open?: boolean;
		entities?: WikiEntity[];
		heading?: string | null;
		onselect: (entity: WikiEntity, heading: string | null) => void;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-dialog max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Choose a target</Dialog.Title>
			<Dialog.Description>This title matches more than one note or task in this workspace.</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-1">
			{#each entities as entity (entity.id)}
				<Button
					variant="secondary"
					class="justify-start"
					onclick={() => {
						open = false;
						onselect(entity, heading);
					}}
				>
					<span class="text-label-sm text-outline">{wikiEntityLabel(entity)}</span>
					{entity.title} · {entity.folder}
				</Button>
			{/each}
		</div>
		<Dialog.Footer>
			<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
