<script lang="ts">
	import { Tag, X } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import AddTagDialog from '$lib/components/dialogs/AddTagDialog.svelte';
	import { t } from '$lib/i18n/index.svelte';

	let {
		tags = [],
		onchange,
	}: {
		tags?: string[];
		onchange: (tags: string[]) => void;
	} = $props();

	let dialogOpen = $state(false);

	function commit(tag: string) {
		onchange([...tags, tag]);
	}

	function remove(tag: string) {
		onchange(tags.filter((item) => item !== tag));
	}
</script>

<div class="flex flex-wrap items-center gap-1.5">
	{#each tags as tag (tag)}
		<span
			class="glass-chip group flex items-center gap-1 rounded-full px-2.5 py-1 text-code-sm font-code text-secondary"
		>
			<Tag size={11} />
			{tag}
			<Button
				bare
				class="ml-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
				aria-label={t('notes.removeTag', { tag })}
				onclick={() => remove(tag)}
			>
				<X size={10} />
			</Button>
		</span>
	{/each}
	<Button
		size="xs"
		shape="pill"
		class="glass-well gap-1 px-2 font-code text-code-sm text-outline hover:bg-transparent"
		onclick={() => (dialogOpen = true)}
	>
		{t('notes.addTagButton')}
	</Button>
</div>

<AddTagDialog bind:open={dialogOpen} existing={tags} onsubmit={commit} />
