<script lang="ts">
	import { Columns2, Eye, PenLine } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import type { EditorView } from '$lib/stores/settings.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		view,
		onview
	}: {
		view: EditorView;
		onview: (view: EditorView) => void;
	} = $props();

	const views: { id: EditorView; icon: typeof Eye; title: string }[] = [
		{ id: 'write', icon: PenLine, title: 'Write' },
		{ id: 'split', icon: Columns2, title: 'Split' },
		{ id: 'preview', icon: Eye, title: 'Preview' }
	];
</script>

<div class="glass-well mr-1 flex items-center rounded-lg p-0.5">
	{#each views as item (item.id)}
		{@const Icon = item.icon}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant={view === item.id ? 'secondary' : 'ghost'}
						size="icon-xs"
						aria-label={item.title}
						onclick={() => onview(item.id)}
					>
						<Icon size={13} />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{item.title}</Tooltip.Content>
		</Tooltip.Root>
	{/each}
</div>
