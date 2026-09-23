<script lang="ts">
	import { Layers3 } from '@lucide/svelte';
	let { name, color = 'primary' }: { name: string; color?: string } = $props();
	const tone = $derived(color === 'secondary' ? 'bg-secondary/10 text-secondary' : color === 'tertiary' ? 'bg-tertiary/10 text-tertiary' : 'bg-primary/10 text-primary');
</script>

	<span class="inline-flex max-w-[150px] items-center gap-1 rounded-md px-1.5 py-0.5 text-code-sm font-code {tone}" title="Workspace: {name}">
	<Layers3 size={11} class="shrink-0" />
	<span class="truncate">{name}</span>
</span>
