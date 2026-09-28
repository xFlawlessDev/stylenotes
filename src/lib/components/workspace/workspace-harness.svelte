<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import Workspace from '$lib/components/workspace/Workspace.svelte';
</script>

<!-- TitleBar uses tooltips, which need the provider context the app layout supplies. -->
<Tooltip.Provider>
	<Workspace />
</Tooltip.Provider>
