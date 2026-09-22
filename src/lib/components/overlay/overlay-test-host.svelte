<script lang="ts">
	/**
	 * Test-only wrapper: the app provides `Tooltip.Provider` in `+layout.svelte`,
	 * so smoke tests mount the overlay tree through this host.
	 */
	import Tooltip from '$lib/components/ui/tooltip/tooltip-provider.svelte';
	import DockRail from '$lib/components/overlay/DockRail.svelte';
</script>

<Tooltip>
	<DockRail />
</Tooltip>
