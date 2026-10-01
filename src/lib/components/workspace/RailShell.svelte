<script lang="ts">
	import { X } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * Shared shell for the workspace folder rail and the task filter rail.
	 *
	 * Both rails were hand-rolled copies of the same `glass-panel` scaffold and
	 * drifted into different flex strategies, which is how one of them ended up
	 * unable to scroll. The shell owns the layout that both need, so the
	 * decisions below live in exactly one place:
	 *
	 * 1. **The shell owns the scroll.** The header, the optional action and the
	 *    optional `prelude` are pinned; `children` go in one scrolling column.
	 * 2. **Pinned regions never shrink.** `shrink-0` keeps a tall list from
	 *    squeezing the header or the primary action out of view.
	 * 3. **Kept off the rounded corners.** The `aside` is `overflow-hidden` and
	 *    `rounded-2xl` with `p-2.5`, so it clips at its *padding* box at 10px
	 *    while the corners curve at 18px. Children therefore never rely on the
	 *    parent's clip, and the scrolling column carries `px-0.5` so a focus
	 *    ring cannot land in the sheared zone.
	 * 4. **The drawer gets a floor.** Tauri windows cannot be scrolled (a
	 *    frameless window has no scrollbar to reach), so the shell keeps a
	 *    `min-h` floor and re-enables the scrollbar when the compact drawer
	 *    rules apply. Below `420px` the floor would overflow, so it is dropped.
	 */
	let {
		title,
		subtitle,
		icon: Icon,
		closeLabel,
		open = false,
		onclose,
		children,
		prelude,
		action,
	}: {
		title: string;
		subtitle: string;
		icon: typeof X;
		closeLabel: string;
		open?: boolean;
		onclose?: () => void;
		children: import('svelte').Snippet;
		/** Pinned between the action and the scrolling region (e.g. a search field). */
		prelude?: import('svelte').Snippet;
		/** Pinned primary action (e.g. New note). */
		action?: import('svelte').Snippet;
	} = $props();
</script>

<aside
	class="rail-panel glass-panel flex w-[248px] shrink-0 flex-col overflow-hidden rounded-2xl p-2.5 max-lg:fixed max-lg:inset-y-2.5 max-lg:left-2.5 max-lg:z-40 max-lg:shadow-2xl max-lg:transition-transform {open
		? 'max-lg:translate-x-0'
		: 'max-lg:-translate-x-[120%]'}"
>
	<div class="flex min-h-[13.5rem] min-w-0 flex-1 flex-col gap-3 max-[420px]:min-h-0">
		<div class="flex shrink-0 items-center gap-2.5 px-1 py-1">
			<div
				class="flex size-9 items-center justify-center rounded-xl bg-surface-container-high/70 text-primary ring-1 ring-inset ring-hairline"
			>
				<Icon size={16} />
			</div>
			<div class="flex min-w-0 flex-col">
				<span class="text-headline-sm font-headline leading-tight text-on-surface">{title}</span>
				<span class="text-label-sm font-label truncate text-outline">{subtitle}</span>
			</div>
			<Button
				size="icon-sm"
				class="ml-auto text-outline lg:hidden"
				aria-label={closeLabel}
				onclick={onclose}
			>
				<X size={16} />
			</Button>
		</div>

		{#if action}
			<div class="shrink-0">
				{@render action()}
			</div>
		{/if}

		{#if prelude}
			<div class="shrink-0">
				{@render prelude()}
			</div>
		{/if}

		<div
			class="scrollbar-none flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-0.5"
		>
			{@render children()}
		</div>
	</div>
</aside>
