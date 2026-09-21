<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { ArrowUpRight, Minus, Pin, PinOff, PictureInPicture2, X } from '@lucide/svelte';
	import { openWorkspace } from '$lib/windows';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		title,
		fallbackTitle,
		icon: Icon,
		saving,
		saveFailed,
		docked,
		alwaysOnTop,
		ontoggledock,
		ontoggletop,
		onminimize,
		onclose,
		actions
	}: {
		title: string;
		fallbackTitle: string;
		icon: Component;
		saving: boolean;
		saveFailed: boolean;
		docked: boolean;
		alwaysOnTop: boolean;
		ontoggledock: () => void;
		ontoggletop: () => void;
		onminimize: () => void;
		onclose: () => void;
		actions?: Snippet;
	} = $props();

	const buttonClass =
		'flex size-6 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:text-on-surface';
</script>

<header
	data-tauri-drag-region
	class="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-hairline/60 bg-surface-container-lowest/60 px-2"
>
	<div class="flex min-w-0 items-center gap-1.5">
		<Icon size={13} class="shrink-0 text-primary" />
		<span class="truncate text-label-md font-label text-on-surface">
			{title || fallbackTitle}
		</span>
		{#if saving}
			<span class="shrink-0 text-code-sm font-code text-outline">Saving…</span>
		{:else if saveFailed}
			<span class="shrink-0 text-code-sm font-code text-error">Not saved</span>
		{/if}
	</div>

	<div class="flex shrink-0 items-center gap-0.5">
		{@render actions?.()}

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						class="flex size-6 items-center justify-center rounded-md transition-colors {docked
							? 'text-primary'
							: 'text-on-surface-variant hover:text-on-surface'}"
						aria-label={docked ? 'Remove from dock' : 'Add to dock'}
						onclick={ontoggledock}
					>
						<PictureInPicture2 size={13} />
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{docked ? 'Remove from dock' : 'Add to dock'}</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						class="flex size-6 items-center justify-center rounded-md transition-colors {alwaysOnTop
							? 'text-primary'
							: 'text-on-surface-variant hover:text-on-surface'}"
						aria-label={alwaysOnTop ? 'Unpin window' : 'Keep window on top'}
						onclick={ontoggletop}
					>
						{#if alwaysOnTop}
							<Pin size={13} />
						{:else}
							<PinOff size={13} />
						{/if}
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{alwaysOnTop ? 'Unpin window' : 'Keep window on top'}</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						class={buttonClass}
						aria-label="Open in Workspace"
						onclick={() => void openWorkspace()}
					>
						<ArrowUpRight size={13} />
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Open in Workspace</Tooltip.Content>
		</Tooltip.Root>

		<span class="mx-0.5 h-4 w-px bg-hairline/70"></span>

		<button
			type="button"
			class="flex size-6 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container/70 hover:text-on-surface"
			aria-label="Minimize"
			onclick={onminimize}
		>
			<Minus size={13} />
		</button>
		<button
			type="button"
			class="flex size-6 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-window-close/20 hover:text-on-surface"
			aria-label="Close window"
			onclick={onclose}
		>
			<X size={13} />
		</button>
	</div>
</header>
