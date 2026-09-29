<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { ArrowUpRight, Minus, Pin, PinOff, PictureInPicture2, X } from '@lucide/svelte';
	import { openWorkspace } from '$lib/windows';
	import { Button } from '$lib/components/base';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { t } from '$lib/i18n/index.svelte';

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

	const buttonClass = 'text-on-surface-variant';
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
			<span class="shrink-0 text-code-sm font-code text-outline">{t('editor.header.saving')}</span>
		{:else if saveFailed}
			<span class="shrink-0 text-code-sm font-code text-error">{t('editor.header.notSaved')}</span>
		{/if}
	</div>

	<div class="flex shrink-0 items-center gap-0.5">
		{@render actions?.()}

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						bare
						class="size-6 rounded-md {docked ? 'text-primary' : 'text-on-surface-variant'}"
						aria-label={docked ? t('editor.header.removeFromDock') : t('editor.header.addToDock')}
						onclick={ontoggledock}
					>
						<PictureInPicture2 size={13} />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{docked ? t('editor.header.removeFromDock') : t('editor.header.addToDock')}</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						bare
						class="size-6 rounded-md {alwaysOnTop
							? 'text-primary'
							: 'text-on-surface-variant'}"
						aria-label={alwaysOnTop ? t('editor.header.unpinWindow') : t('editor.header.pinWindow')}
						onclick={ontoggletop}
					>
						{#if alwaysOnTop}
							<Pin size={13} />
						{:else}
							<PinOff size={13} />
						{/if}
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{alwaysOnTop ? t('editor.header.unpinWindow') : t('editor.header.pinWindow')}</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						bare
						class="size-6 rounded-md {buttonClass}"
						aria-label={t('editor.header.openWorkspace')}
						onclick={() => void openWorkspace()}
					>
						<ArrowUpRight size={13} />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{t('editor.header.openWorkspace')}</Tooltip.Content>
		</Tooltip.Root>

		<span class="mx-0.5 h-4 w-px bg-hairline/70"></span>

		<Button
			bare
			class="size-6 rounded-md text-on-surface-variant hover:bg-surface-container/70 hover:text-on-surface"
			aria-label={t('editor.header.minimize')}
			onclick={onminimize}
		>
			<Minus size={13} />
		</Button>
		<Button
			bare
			class="size-6 rounded-md text-on-surface-variant hover:bg-window-close/20 hover:text-on-surface"
			aria-label={t('editor.header.close')}
			onclick={onclose}
		>
			<X size={13} />
		</Button>
	</div>
</header>
