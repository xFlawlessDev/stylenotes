<script lang="ts">
	import type { Snippet } from 'svelte';
	import { workspaceStore } from '$lib/stores/workspaces.svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div data-workspace-id={workspaceStore.activeId} class="contents">
	{@render children()}
</div>
