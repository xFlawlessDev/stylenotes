<script lang="ts">
	import { List } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { t } from '$lib/i18n/index.svelte';

	let { open, ontoggle }: { open: boolean; ontoggle: () => void } = $props();

	const label = $derived(t(open ? 'notes.editor.toc.hide' : 'notes.editor.toc.show'));
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant={open ? 'secondary' : 'ghost'}
				size="icon-xs"
				class="absolute top-2 right-2 z-20"
				aria-label={label}
				aria-expanded={open}
				onclick={ontoggle}
			>
				<List size={14} />
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>{label}</Tooltip.Content>
</Tooltip.Root>
