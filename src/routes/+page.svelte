<script lang="ts">
	import { onMount } from 'svelte';
	import Workspace from '$lib/components/workspace/Workspace.svelte';
	import DockRail from '$lib/components/overlay/DockRail.svelte';
	import { currentWindowRole } from '$lib/windows';

	let role = $state<'workspace' | 'overlay'>('workspace');

	onMount(() => {
		role = currentWindowRole();
		document.documentElement.dataset.window = role;
	});
</script>

{#if role === 'overlay'}
	<div class="h-screen w-screen bg-transparent">
		<DockRail />
	</div>
{:else}
	<Workspace />
{/if}