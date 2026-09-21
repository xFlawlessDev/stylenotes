<script lang="ts">
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { Search, Bell, HardDrive, Sparkles } from '@lucide/svelte';
	import { isTauri } from '$lib/windows';

	let { title = 'StyleNotes' }: { title?: string } = $props();

	function win() {
		return getCurrentWindow();
	}
</script>

<header
	data-tauri-drag-region
	class="glass-panel relative z-10 m-2.5 mb-0 flex h-12 shrink-0 items-center justify-between rounded-2xl px-3"
>
	<div class="flex items-center gap-3">
		<div class="flex items-center gap-2 pr-1">
			<button
				class="group flex size-3 items-center justify-center rounded-full bg-[#ff5f57] transition-transform hover:scale-110"
				aria-label="Close"
				onclick={() => isTauri && win().close()}
			>
				<span class="size-1.5 rounded-full bg-black/50 opacity-0 group-hover:opacity-100"></span>
			</button>
			<button
				class="group flex size-3 items-center justify-center rounded-full bg-[#febc2e] transition-transform hover:scale-110"
				aria-label="Minimize"
				onclick={() => isTauri && win().minimize()}
			>
				<span class="size-1.5 rounded-full bg-black/50 opacity-0 group-hover:opacity-100"></span>
			</button>
			<button
				class="group flex size-3 items-center justify-center rounded-full bg-[#28c840] transition-transform hover:scale-110"
				aria-label="Maximize"
				onclick={() => isTauri && win().toggleMaximize()}
			>
				<span class="size-1.5 rounded-full bg-black/50 opacity-0 group-hover:opacity-100"></span>
			</button>
		</div>

		<div class="glass-divider h-5 w-px"></div>

		<div class="flex items-center gap-2">
			<div
				class="flex size-6 items-center justify-center rounded-lg bg-surface-container-high/70 text-primary ring-1 ring-inset ring-white/5"
			>
				<Sparkles size={14} />
			</div>
			<span class="text-headline-sm font-headline tracking-tight text-on-surface">{title}</span>
			<span
				class="ml-0.5 rounded-full bg-primary-container/25 px-2 py-0.5 text-label-sm font-label text-primary"
				>Local-first</span
			>
		</div>
	</div>

	<div class="flex items-center gap-2">
		<div class="glass-chip hidden items-center gap-1.5 rounded-full py-1 pr-3 pl-2.5 md:flex">
			<HardDrive size={13} class="text-tertiary" />
			<span class="text-label-sm font-label text-on-surface-variant">On this device</span>
		</div>
		<button
			class="glass-chip flex size-8 items-center justify-center rounded-full text-on-surface-variant transition-all hover:text-on-surface"
			aria-label="Search"
		>
			<Search size={16} />
		</button>
		<button
			class="glass-chip relative flex size-8 items-center justify-center rounded-full text-on-surface-variant transition-all hover:text-on-surface"
			aria-label="Notifications"
		>
			<Bell size={16} />
			<span class="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-secondary"></span>
		</button>
		<button
			class="flex size-8 items-center justify-center rounded-full bg-surface-container-high text-label-md font-label font-semibold text-primary ring-1 ring-inset ring-white/5 transition-transform hover:scale-105"
			aria-label="Account"
		>
			AR
		</button>
	</div>
</header>