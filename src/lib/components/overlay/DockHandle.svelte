<script lang="ts">
	import {
		PanelLeftClose,
		PanelLeftOpen,
		PanelRightClose,
		PanelRightOpen,
		PanelTopClose,
		PanelTopOpen
	} from '@lucide/svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { t } from '$lib/i18n/index.svelte';
	import { dockAxis, dockTooltipSide, type DockEdge } from '$lib/dock';
	import { edgeDrag } from '$lib/drag';

	let {
		edge,
		collapsed,
		ontoggle,
		ondraggingchange
	}: {
		edge: DockEdge;
		collapsed: boolean;
		ontoggle: () => void;
		ondraggingchange: (dragging: boolean) => void;
	} = $props();

	const openIcons: Record<DockEdge, typeof PanelRightOpen> = {
		left: PanelLeftOpen,
		right: PanelRightOpen,
		top: PanelTopOpen
	};

	const closeIcons: Record<DockEdge, typeof PanelRightClose> = {
		left: PanelLeftClose,
		right: PanelRightClose,
		top: PanelTopClose
	};

	const tabRadius: Record<DockEdge, string> = {
		left: 'rounded-r-xl',
		right: 'rounded-l-xl',
		top: 'rounded-b-xl'
	};

	const Icon = $derived((collapsed ? openIcons : closeIcons)[edge]);
	const label = $derived(collapsed ? t('over.expand') : t('over.handle'));
	// Stays a native button: the drag action cannot attach to a component.
	const classes = $derived(
		collapsed
			? `flex h-full w-full cursor-grab touch-none items-center justify-center bg-surface-container-lowest/90 text-on-surface-variant shadow-2xl backdrop-blur-2xl transition-colors hover:text-primary active:cursor-grabbing ${tabRadius[edge]}`
			: 'glass-chip flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-on-surface-variant transition-all hover:text-on-surface active:cursor-grabbing'
	);
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				use:edgeDrag={{
					axis: dockAxis(edge),
					onClick: ontoggle,
					onStateChange: ondraggingchange
				}}
				class={classes}
				aria-label={label}
				onclick={(event) => {
					// Pointer presses are resolved by the drag action (click vs
					// drag); keyboard and assistive tech report detail 0.
					if (event.detail === 0) ontoggle();
				}}
			>
				<Icon size={collapsed ? 15 : 14} />
			</button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side={dockTooltipSide(edge)}>{label}</Tooltip.Content>
</Tooltip.Root>
