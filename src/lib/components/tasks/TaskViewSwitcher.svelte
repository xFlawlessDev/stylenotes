<script lang="ts">
	import { Columns2, Eye, PenLine } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import type { TaskView } from '$lib/stores/settings.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { t } from '$lib/i18n/index.svelte';

	let {
		view,
		onview
	}: {
		view: TaskView;
		onview: (view: TaskView) => void;
	} = $props();

	const views: { id: TaskView; icon: typeof Eye; title: string }[] = [
		{ id: 'write', icon: PenLine, title: t('settings.editor.view.write') },
		{ id: 'split', icon: Columns2, title: t('settings.editor.view.split') },
		{ id: 'preview', icon: Eye, title: t('settings.editor.view.preview') }
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
