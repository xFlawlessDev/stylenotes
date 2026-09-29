<script lang="ts">
	import { Layers3 } from '@lucide/svelte';
	import { t } from '$lib/i18n/index.svelte';

	let {
		name,
		color = 'primary',
		/** Marks a record that lives outside the workspace this window follows. */
		foreign = false
	}: { name: string; color?: string; foreign?: boolean } = $props();
	const tone = $derived(
		color === 'secondary'
			? 'bg-secondary/10 text-secondary'
			: color === 'tertiary'
				? 'bg-tertiary/10 text-tertiary'
				: 'bg-primary/10 text-primary'
	);
	const title = $derived(
		foreign
			? t('shell.workspace.foreignBadge', { name })
			: t('shell.workspace.activeBadge', { name })
	);
</script>

<span
	class="inline-flex max-w-[150px] items-center gap-1 rounded-md px-1.5 py-0.5 text-code-sm font-code {tone}
		{foreign ? 'ring-1 ring-inset ring-current/30' : ''}"
	{title}
>
	<Layers3 size={11} class="shrink-0" />
	<span class="truncate">{name}</span>
</span>
