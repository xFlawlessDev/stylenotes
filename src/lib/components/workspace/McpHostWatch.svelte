<script lang="ts">
	/**
	 * Starts the in-app MCP host while the workspace window is mounted (#D4).
	 *
	 * Kept as its own component so `Workspace.svelte` — already at the size cap —
	 * gains no logic: the always-alive workspace window renders this, every other
	 * window role does not.
	 */
	import { onMount } from 'svelte';
	import { startMcpHost, stopMcpHost } from '$lib/stores/mcp-host.svelte';

	onMount(() => {
		void startMcpHost();
		return () => stopMcpHost();
	});
</script>
