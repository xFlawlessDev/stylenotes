<script lang="ts">
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import {
		Search,
		Moon,
		Sun,
		PanelRight,
		NotebookPen,
		ListTodo,
		Network,
		FolderTree,
		Rows3,
		Sparkles,
		Settings as SettingsIcon,
	} from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { isTauri, type WorkspaceSection } from '$lib/windows';
	import { Button, SegmentedControl } from '$lib/components/base';
	import type { ThemeMode } from '$lib/stores/settings.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import WorkspaceSwitcher from '$lib/components/workspace/WorkspaceSwitcher.svelte';

	let {
		title = 'StyleNotes',
		mode = 'dark',
		section = 'notes',
		showpanelbuttons = false,
		onpalette,
		onsettings,
		ontogglemode,
		ontoggledock,
		onassistant,
		onsection,
		onopenfolders,
		onopennotes,
		notifications,
		workspaceId,
		workspaces = [],
		onworkspacechange,
		onworkspacecreate,
		onworkspacerename,
		onworkspacedelete,
	}: {
		title?: string;
		mode?: ThemeMode;
		section?: WorkspaceSection;
		showpanelbuttons?: boolean;
		onpalette?: () => void;
		onsettings?: () => void;
		ontogglemode?: () => void;
		ontoggledock?: () => void;
		onassistant?: () => void;
		onsection?: (section: WorkspaceSection) => void;
		onopenfolders?: () => void;
		onopennotes?: () => void;
		notifications?: Snippet;
		workspaceId?: string;
		workspaces?: { id: string; name: string; color: string }[];
		onworkspacechange?: (id: string) => void;
		/** Resolve to `false` when the write failed so the dialog can show it. */
		onworkspacecreate?: (name: string) => boolean | Promise<boolean>;
		onworkspacerename?: (id: string, name: string) => boolean | Promise<boolean>;
		onworkspacedelete?: (id: string) => boolean | Promise<boolean>;
	} = $props();

	const sections = [
		{ id: 'notes' as const, label: 'Notes', icon: NotebookPen },
		{ id: 'tasks' as const, label: 'Tasks', icon: ListTodo },
		{ id: 'graph' as const, label: 'Graph', icon: Network },
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
		{#if workspaceId && workspaces.length}
			<WorkspaceSwitcher
				activeId={workspaceId}
				{workspaces}
				onchange={onworkspacechange}
				oncreate={onworkspacecreate}
				onrename={onworkspacerename}
				ondelete={onworkspacedelete}
			/>
		{/if}

		<SegmentedControl
			value={section}
			items={sections}
			ariaLabel="Workspace section"
			class="ml-1 hidden rounded-full sm:flex"
			itemClass="rounded-full px-3 text-label-md"
			onchange={(id) => onsection?.(id as WorkspaceSection)}
		/>
	</div>

	<!-- Controls -->
	<div class="flex items-center gap-1.5">
		{#if section === 'notes' && showpanelbuttons}
			<div class="flex items-center gap-0.5">
				<Button
					variant="secondary"
					size="icon"
					shape="pill"
					class="text-on-surface-variant lg:hidden"
					aria-label="Open folders"
					onclick={onopenfolders}
				>
					<FolderTree size={16} />
				</Button>
				<Button
					variant="secondary"
					size="icon"
					shape="pill"
					class="text-on-surface-variant md:hidden"
					aria-label="Open notes list"
					onclick={onopennotes}
				>
					<Rows3 size={16} />
				</Button>
			</div>
		{/if}
		<Button
			shape="pill"
			class="glass-well h-8 min-w-0 justify-start gap-2 pr-2 pl-3 text-left hover:bg-transparent hover:ring-1 hover:ring-inset hover:ring-emphasis-ring md:w-36 lg:w-48"
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
		</Button>

		<div class="glass-divider mx-0.5 hidden h-5 w-px sm:block"></div>

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						size="icon"
						shape="pill"
						class="text-on-surface-variant"
						aria-label="Toggle AI assistant"
						onclick={onassistant}
					>
						<Sparkles size={16} />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>AI assistant</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						size="icon"
						shape="pill"
						class="text-on-surface-variant"
						aria-label="Toggle dock"
						onclick={ontoggledock}
					>
						<PanelRight size={16} />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Toggle dock</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						size="icon"
						shape="pill"
						class="text-on-surface-variant"
						aria-label="Toggle theme"
						onclick={ontogglemode}
					>
						{#if mode === 'dark'}
							<Sun size={16} />
						{:else}
							<Moon size={16} />
						{/if}
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Toggle light and dark</Tooltip.Content>
		</Tooltip.Root>

		{@render notifications?.()}

		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="tonal"
						size="icon"
						shape="pill"
						class="font-semibold hover:scale-105"
						aria-label="Open settings"
						onclick={onsettings}
					>
						<SettingsIcon size={16} />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Settings</Tooltip.Content>
		</Tooltip.Root>
	</div>
</header>
