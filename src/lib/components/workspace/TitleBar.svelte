<script lang="ts">
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import {
		Search,
		Moon,
		Sun,
		PanelRight,
		NotebookPen,
		ListTodo,
		FolderTree,
		Rows3,
	} from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { isTauri } from '$lib/windows';
	import type { ThemeMode } from '$lib/stores/settings.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		title = 'StyleNotes',
		mode = 'dark',
		section = 'notes',
		showpanelbuttons = false,
		onpalette,
		onsettings,
		ontogglemode,
		ontoggledock,
		onsection,
		onopenfolders,
		onopennotes,
		notifications,
	}: {
		title?: string;
		mode?: ThemeMode;
		section?: 'notes' | 'tasks';
		showpanelbuttons?: boolean;
		onpalette?: () => void;
		onsettings?: () => void;
		ontogglemode?: () => void;
		ontoggledock?: () => void;
		onsection?: (section: 'notes' | 'tasks') => void;
		onopenfolders?: () => void;
		onopennotes?: () => void;
		notifications?: Snippet;
	} = $props();

	const sections = [
		{ id: 'notes' as const, label: 'Notes', icon: NotebookPen },
		{ id: 'tasks' as const, label: 'Tasks', icon: ListTodo },
	];

	function win() {
		return getCurrentWindow();
	}

	/** Hides the window instead of closing it: the app keeps running in the tray. */
	async function hideWindow() {
		if (!isTauri) return;
		try {
			await win().hide();
		} catch {
			/* window is already hidden */
		}
	}
</script>

<header
	data-tauri-drag-region
	class="glass-panel relative z-30 m-2.5 mb-0 flex h-12 shrink-0 items-center justify-between rounded-2xl px-3"
>
	<!-- Brand -->
	<div class="flex items-center gap-3">
		<div class="flex items-center gap-2 pr-1">
			<button
				class="group flex size-3 items-center justify-center rounded-full bg-window-close transition-transform hover:scale-110"
				aria-label="Hide to tray"
				onclick={hideWindow}
			>
				<span class="size-1.5 rounded-full bg-window-control-glyph opacity-0 group-hover:opacity-100"></span>
			</button>
			<button
				class="group flex size-3 items-center justify-center rounded-full bg-window-minimize transition-transform hover:scale-110"
				aria-label="Minimize"
				onclick={() => isTauri && win().minimize()}
			>
				<span class="size-1.5 rounded-full bg-window-control-glyph opacity-0 group-hover:opacity-100"></span>
			</button>
			<button
				class="group flex size-3 items-center justify-center rounded-full bg-window-maximize transition-transform hover:scale-110"
				aria-label="Maximize"
				onclick={() => isTauri && win().toggleMaximize()}
			>
				<span class="size-1.5 rounded-full bg-window-control-glyph opacity-0 group-hover:opacity-100"></span>
			</button>
		</div>

		<div class="glass-divider h-5 w-px"></div>

		<div class="flex items-center gap-2">
			<img
				src="/icon-128.png"
				alt="StyleNotes"
				class="size-6 object-cover"
			/>
			<span class="text-headline-sm font-headline tracking-tight text-on-surface">{title}</span>
		</div>

		<div class="glass-well ml-1 hidden items-center rounded-full p-0.5 sm:flex">
			{#each sections as item (item.id)}
				{@const Icon = item.icon}
				<button
					class="flex items-center gap-1.5 rounded-full px-3 py-1 text-label-md font-label transition-all {section ===
					item.id
						? 'glass-chip font-medium text-on-surface'
						: 'text-outline hover:text-on-surface'}"
					aria-pressed={section === item.id}
					onclick={() => onsection?.(item.id)}
				>
					<Icon size={14} /> {item.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Controls -->
	<div class="flex items-center gap-1.5">
		{#if section === 'notes' && showpanelbuttons}
			<div class="flex items-center gap-0.5">
				<button
					class="glass-chip flex size-8 items-center justify-center rounded-full text-on-surface-variant transition-all hover:text-on-surface lg:hidden"
					aria-label="Open folders"
					onclick={onopenfolders}
				>
					<FolderTree size={16} />
				</button>
				<button
					class="glass-chip flex size-8 items-center justify-center rounded-full text-on-surface-variant transition-all hover:text-on-surface md:hidden"
					aria-label="Open notes list"
					onclick={onopennotes}
				>
					<Rows3 size={16} />
				</button>
			</div>
		{/if}
		<button
			class="glass-well flex h-8 min-w-0 items-center gap-2 rounded-full pr-2 pl-3 text-left transition-all hover:ring-1 hover:ring-inset hover:ring-emphasis-ring md:w-72 lg:w-80"
			aria-label="Open command palette"
			onclick={onpalette}
		>
			<Search size={14} class="shrink-0 text-outline" />
			<span class="hidden flex-1 truncate text-body-sm font-body text-outline md:block"
				>Search notes and actions</span
			>
			<kbd
				class="hidden shrink-0 rounded-md bg-surface-container-high/70 px-1.5 py-0.5 text-code-sm font-code text-outline md:block"
				>Ctrl K</kbd
			>
		</button>

		<div class="glass-divider mx-0.5 hidden h-5 w-px sm:block"></div>

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						class="glass-chip flex size-8 items-center justify-center rounded-full text-on-surface-variant transition-all hover:text-on-surface"
						aria-label="Toggle dock"
						onclick={ontoggledock}
					>
						<PanelRight size={16} />
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Toggle dock</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						class="glass-chip flex size-8 items-center justify-center rounded-full text-on-surface-variant transition-all hover:text-on-surface"
						aria-label="Toggle theme"
						onclick={ontogglemode}
					>
						{#if mode === 'dark'}
							<Sun size={16} />
						{:else}
							<Moon size={16} />
						{/if}
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Toggle light and dark</Tooltip.Content>
		</Tooltip.Root>

		{@render notifications?.()}

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						class="emphasis-container flex size-8 items-center justify-center rounded-full text-label-md font-label font-semibold text-on-primary-container ring-1 ring-inset ring-emphasis-container-ring transition-all hover:scale-105"
						aria-label="Open settings"
						onclick={onsettings}
					>
						<span class="relative">AR</span>
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Settings</Tooltip.Content>
		</Tooltip.Root>
	</div>
</header>