<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Workspace from '$lib/components/workspace/Workspace.svelte';
	import DockRail from '$lib/components/overlay/DockRail.svelte';
	import { currentWindowRole, revealCurrentWindow } from '$lib/windows';

	let role = $state<'workspace' | 'overlay'>('workspace');

	onMount(async () => {
		role = currentWindowRole();
		document.documentElement.dataset.window = role;
		await tick();
		requestAnimationFrame(() => revealCurrentWindow());
	});
</script>

{#if role === 'overlay'}
	<div class="h-screen w-screen bg-transparent">
		<DockRail />
	</div>
{:else}
	<Workspace />
{/if}