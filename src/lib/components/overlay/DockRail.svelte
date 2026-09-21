<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWindow, cursorPosition } from '@tauri-apps/api/window';
	import {
		Rocket,
		ShoppingBasket,
		Key,
		Palette,
		Plus,
		Pin,
		ArrowUpRight,
		NotebookPen,
		Copy,
		Trash2,
		Pencil,
		CheckSquare,
		Square,
	} from '@lucide/svelte';
	import { isTauri, openWorkspace } from '$lib/windows';
	import { verticalDrag } from '$lib/drag';

	type Tone = 'secondary' | 'tertiary' | 'error' | 'primary';

	type RailNote = {
		id: string;
		tone: Tone;
		icon: typeof Rocket;
		label: string;
		title: string;
		excerpt: string;
		edited: string;
		tags: string[];
		pinned?: boolean;
		checklist: { text: string; done: boolean }[];
	};

	const notes: RailNote[] = [
		{
			id: 'sprint',
			tone: 'secondary',
			icon: Rocket,
			label: 'Sprint',
			title: 'Architecture Plan: NoteDock Engine',
			excerpt:
				'Multi-window IPC routing patterns, SQLite schema synchronizer, and zero-latency floating dock protocol.',
			edited: '2m ago',
			tags: ['#Dev', '#Sprint'],
			pinned: true,
			checklist: [
				{ text: 'SQLite cascade deletions', done: true },
				{ text: 'Window drag region', done: true },
				{ text: 'IPC benchmark', done: false },
			],
		},
		{
			id: 'personal',
			tone: 'tertiary',
			icon: ShoppingBasket,
			label: 'Personal',
			title: 'Grocery & Household Supplies',
			excerpt:
				'Oat milk, cold brew concentrate, almonds, spinach, Greek yogurt, and dish soap refill.',
			edited: '1h ago',
			tags: ['#Home'],
			checklist: [
				{ text: 'Oat milk + cold brew', done: false },
				{ text: 'Spinach & yogurt', done: false },
				{ text: 'Dish soap refill', done: true },
			],
		},
		{
			id: 'dev',
			tone: 'error',
			icon: Key,
			label: 'Dev',
			title: 'API Tokens & Rotation Keys',
			excerpt:
				'Rotate staging credentials weekly. Production keys live in the encrypted vault, never in plaintext.',
			edited: '3h ago',
			tags: ['#Security'],
			checklist: [
				{ text: 'Rotate staging token', done: true },
				{ text: 'Move prod key to vault', done: false },
			],
		},
		{
			id: 'ideas',
			tone: 'primary',
			icon: Palette,
			label: 'Ideas',
			title: 'Glass Shader & Motion Specs',
			excerpt:
				'Adjust chromatic aberration on docked tiles. Spring curves (mass 0.8, stiffness 220) for rail expansion.',
			edited: '4m ago',
			tags: ['#Design'],
			pinned: true,
			checklist: [
				{ text: 'backdrop-filter: blur(28px)', done: true },
				{ text: 'GLSL chromatic border', done: false },
			],
		},
	];

	const barClass: Record<Tone, string> = {
		secondary: 'bg-secondary',
		tertiary: 'bg-tertiary',
		error: 'bg-error',
		primary: 'bg-primary',
	};
	const textClass: Record<Tone, string> = {
		secondary: 'text-secondary',
		tertiary: 'text-tertiary',
		error: 'text-error',
		primary: 'text-primary',
	};

	const RAIL_W = 60;
	const WINDOW_H = 304;
	const CARD_H = 280;
	const POLL_MS = 40;

	let hovered = $state<RailNote | null>(null);
	let cardTop = $state(8);
	let railEl: HTMLElement | undefined = $state();
	let cardEl: HTMLElement | undefined = $state();
	let ignoring = false;
	let dragging = false;

	function inRect(el: HTMLElement | undefined, x: number, y: number) {
		if (!el) return false;
		const r = el.getBoundingClientRect();
		return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
	}

	async function setIgnore(value: boolean) {
		if (!isTauri || ignoring === value) return;
		ignoring = value;
		await getCurrentWindow().setIgnoreCursorEvents(value);
	}

	function noteAtPoint(x: number, y: number): { note: RailNote; top: number } | null {
		if (!railEl) return null;
		const buttons = railEl.querySelectorAll<HTMLElement>('[data-note-id]');
		for (const btn of buttons) {
			const r = btn.getBoundingClientRect();
			if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
				const note = notes.find((n) => n.id === btn.dataset.noteId);
				if (note) {
					const top = Math.min(WINDOW_H - CARD_H - 8, Math.max(8, r.top + r.height / 2 - CARD_H / 2));
					return { note, top };
				}
			}
		}
		return null;
	}

	async function openWorkspaceAndClose() {
		await openWorkspace();
		if (isTauri) await getCurrentWindow().hide();
	}

	onMount(() => {
		if (!isTauri) return;

		void setIgnore(true);

		let timer: ReturnType<typeof setTimeout> | undefined;
		const tick = async () => {
			try {
				if (dragging) {
					await setIgnore(false);
					timer = setTimeout(tick, POLL_MS);
					return;
				}
				const [cursor, pos, scale] = await Promise.all([
					cursorPosition(),
					getCurrentWindow().outerPosition(),
					getCurrentWindow().scaleFactor(),
				]);
				const x = (cursor.x - pos.x) / scale;
				const y = (cursor.y - pos.y) / scale;

				const hit = noteAtPoint(x, y);
				const overRail = inRect(railEl, x, y);
				const overCard = inRect(cardEl, x, y);

				if (overRail) {
					await setIgnore(false);
					if (hit) {
						hovered = hit.note;
						cardTop = hit.top;
					}
				} else if (overCard) {
					await setIgnore(false);
				} else {
					hovered = null;
					await setIgnore(true);
				}
			} catch {
				/* ignore */
			}
			timer = setTimeout(tick, POLL_MS);
		};
		timer = setTimeout(tick, POLL_MS);

		return () => clearTimeout(timer);
	});
</script>

<div class="relative h-screen w-screen overflow-hidden" role="presentation">
	<!-- Note preview card -->
	{#if hovered}
		<div
			bind:this={cardEl}
			onmouseleave={() => (hovered = null)}
			role="tooltip"
			class="absolute flex w-72 flex-col gap-2 rounded-xl bg-surface-container-high/92 p-3 shadow-2xl backdrop-blur-2xl"
			style="right: 52px; top: {cardTop}px;"
		>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-1.5">
					<span class="size-2.5 rounded-full {barClass[hovered.tone]}"></span>
					<span class="text-label-sm font-label font-semibold tracking-wider uppercase {textClass[hovered.tone]}">
						{hovered.label}
					</span>
				</div>
				<span class="text-code-sm font-code text-outline-variant">{hovered.edited}</span>
			</div>

			<div class="flex flex-col gap-1">
				<div class="flex items-start justify-between gap-1">
					<h2 class="text-headline-sm font-headline leading-tight text-on-surface">
						{hovered.title}
					</h2>
					{#if hovered.pinned}
						<Pin size={13} class="mt-0.5 shrink-0 text-primary" />
					{/if}
				</div>
				<p class="line-clamp-2 text-body-sm font-body leading-relaxed text-on-surface-variant">
					{hovered.excerpt}
				</p>
			</div>

			<div class="flex flex-col gap-1 rounded-lg bg-surface-container-lowest/70 p-2 text-code-sm font-code">
				{#each hovered.checklist as item}
					<div class="flex items-center gap-1.5">
						{#if item.done}
							<CheckSquare size={13} class="text-tertiary" />
							<span class="text-outline line-through">{item.text}</span>
						{:else}
							<Square size={13} class="text-outline-variant" />
							<span class="text-on-surface-variant">{item.text}</span>
						{/if}
					</div>
				{/each}
			</div>

			<div class="flex items-center justify-between">
				<div class="flex gap-1">
					{#each hovered.tags as tag}
						<span class="rounded bg-surface-container-highest px-1.5 py-px text-code-sm font-code text-on-surface-variant">
							{tag}
						</span>
					{/each}
				</div>
				<div class="flex items-center gap-0.5">
					<button
						class="flex size-7 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
						title="Edit"
					>
						<NotebookPen size={15} />
					</button>
					<button
						class="flex size-7 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-secondary"
						title="Copy"
					>
						<Copy size={15} />
					</button>
					<button
						class="flex size-7 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
						title="Rename"
					>
						<Pencil size={15} />
					</button>
					<button
						class="flex size-7 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error-container/40 hover:text-error"
						title="Delete"
					>
						<Trash2 size={15} />
					</button>
				</div>
			</div>

			<button
				class="flex items-center justify-center gap-1.5 rounded-lg bg-primary-container px-3 py-1.5 text-headline-sm font-headline text-on-primary transition-all hover:bg-primary"
				onclick={openWorkspaceAndClose}
			>
				<span>Open in Workspace</span>
				<ArrowUpRight size={14} />
			</button>
		</div>
	{/if}

	<!-- Rail -->
	<div
		bind:this={railEl}
		class="absolute top-3 right-0 flex flex-col items-center gap-2.5 rounded-l-2xl bg-surface-container-lowest/90 py-3 shadow-2xl backdrop-blur-2xl"
		style="width: {RAIL_W}px;"
	>
		<button
			use:verticalDrag={(d) => (dragging = d)}
			class="mb-0.5 h-3 w-7 cursor-grab touch-none active:cursor-grabbing"
			aria-label="Drag vertically to reposition"
		>
			<span class="mx-auto block h-1 w-4 rounded-full bg-outline-variant/60"></span>
		</button>

		{#each notes as note (note.id)}
			{@const Icon = note.icon}
			<button
				data-note-id={note.id}
				class="group relative flex size-9 items-center justify-center rounded-xl transition-all {hovered?.id ===
				note.id
					? 'scale-105 bg-primary-container/20'
					: 'bg-surface-container hover:scale-105 hover:bg-surface-container-high'}"
				title={note.title}
			>
				<Icon size={19} class={textClass[note.tone]} />
				{#if hovered?.id === note.id}
					<span class="absolute top-0.5 right-0 h-8 w-1.5 rounded-l {barClass[note.tone]}"></span>
				{:else}
					<span class="absolute top-1 right-0 h-7 w-1 rounded-l {barClass[note.tone]}"></span>
				{/if}
			</button>
		{/each}

		<div class="my-0.5 h-px w-6 bg-surface-container"></div>

		<button
			class="flex size-9 items-center justify-center rounded-xl bg-primary text-on-primary shadow-md transition-all hover:scale-105"
			title="Add Sticky Note"
		>
			<Plus size={19} />
		</button>
	</div>
</div>