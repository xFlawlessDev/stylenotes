<script lang="ts">
	import { Separator } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: Separator.RootProps = $props();
</script>

<Separator.Root
	bind:ref
	data-slot="select-separator"
	class={cn("bg-border -mx-1 my-1 h-px pointer-events-none", className)}
	{...restProps}
/>
