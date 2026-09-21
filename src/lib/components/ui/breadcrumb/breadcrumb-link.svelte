<script lang="ts">
	import type { HTMLAnchorAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> = $props();
</script>

<a
	bind:this={ref}
	data-slot="breadcrumb-link"
	class={cn("hover:text-foreground transition-colors", className)}
	{...restProps}
>
	{@render children?.()}
</a>