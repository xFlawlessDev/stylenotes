<script lang="ts">
	import {
		Bell,
		BellOff,
		Clock,
		CloudCheck,
		Lightbulb,
		AtSign,
		Check,
		Trash2,
	} from '@lucide/svelte';
	import type { NotificationKind } from '$lib/stores/notifications';
	import { Button, EmptyState } from '$lib/components/base';
	import * as Tooltip from '$lib/components/ui/tooltip';

	export type Notification = {
		id: string;
		kind: NotificationKind;
		title: string;
		body: string;
		time: string;
		read: boolean;
	};

	let {
		open = false,
		notifications,
		ontoggle,
		onread,
		onreadall,
		onclear,
		onclose,
	}: {
		open?: boolean;
		notifications: Notification[];
		ontoggle: () => void;
		onread: (id: string) => void;
		onreadall: () => void;
		onclear: () => void;
		onclose: () => void;
	} = $props();

	const kindIcon: Record<NotificationKind, typeof Bell> = {
		reminder: Clock,
		sync: CloudCheck,
		tip: Lightbulb,
		mention: AtSign,
	};

	const kindTone: Record<NotificationKind, string> = {
		reminder: 'text-secondary',
		sync: 'text-tertiary',
		tip: 'text-primary',
		mention: 'text-primary',
	};

	const unreadCount = $derived(notifications.filter((item) => !item.read).length);
</script>

<div class="relative">
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="secondary"
					size="icon"
					shape="pill"
					class="relative text-on-surface-variant"
					aria-label="Notifications"
					onclick={ontoggle}
				>
					<Bell size={16} />
					{#if unreadCount > 0}
						<span
							class="absolute -top-0.5 -right-0.5 flex min-w-[15px] items-center justify-center rounded-full bg-secondary px-1 text-[9px] font-semibold text-on-secondary"
						>
							{unreadCount}
						</span>
					{/if}
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>Notifications</Tooltip.Content>
	</Tooltip.Root>
</div>

{#if open}
	<button
		class="fixed inset-0 z-40 cursor-default"
		aria-label="Close notifications"
		onclick={onclose}
	></button>
	<div
		class="glass-solid fixed top-14 right-3 z-50 flex max-h-[440px] w-[352px] flex-col overflow-hidden rounded-2xl"
	>
		<div class="flex items-center justify-between px-3.5 py-3">
			<div class="flex items-center gap-2">
				<span class="text-headline-sm font-headline text-on-surface">Notifications</span>
				{#if unreadCount > 0}
					<span
						class="rounded-full bg-secondary-container px-2 py-0.5 text-label-sm font-label text-on-secondary-container"
						>{unreadCount} new</span
					>
				{/if}
			</div>
			{#if notifications.length > 0}
				<Button
					bare
					class="text-label-sm text-primary hover:brightness-110"
					onclick={onreadall}
				>
					Mark all read
				</Button>
			{/if}
		</div>

		<div class="glass-divider h-px"></div>

		<div class="scrollbar-none flex max-h-[300px] flex-1 flex-col overflow-y-auto p-1.5">
			{#if notifications.length === 0}
				<EmptyState icon={BellOff} title="You are all caught up." class="flex-none" />
			{/if}

			{#each notifications as item (item.id)}
				{@const Icon = kindIcon[item.kind] ?? Bell}
				<Button
					bare
					class="group relative w-full justify-start gap-3 rounded-xl p-2.5 text-left {item.read
						? 'hover:bg-surface-container/40'
						: 'bg-surface-container/55 hover:bg-surface-container/70'}"
					onclick={() => onread(item.id)}
				>
					{#if !item.read}
						<span class="emphasis-primary absolute top-3.5 right-3 size-1.5 rounded-full"></span>
					{/if}
					<span
						class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl {item.read
							? 'bg-surface-container/50'
							: 'bg-surface-container-high'} {kindTone[item.kind]}"
					>
						<Icon size={16} />
					</span>
					<span class="flex min-w-0 flex-col gap-0.5 pr-3">
						<span
							class="text-label-md font-label font-medium {item.read
								? 'text-on-surface-variant'
								: 'text-on-surface'}">{item.title}</span
						>
						<span class="text-body-sm font-body leading-snug {item.read
							? 'text-outline'
							: 'text-on-surface-variant'}">{item.body}</span
						>
						<span class="text-code-sm font-code text-outline">{item.time}</span>
					</span>
				</Button>
			{/each}
		</div>

		{#if notifications.length > 0}
			<div class="glass-divider h-px"></div>
			<div class="flex items-center justify-between px-3.5 py-2">
				<Button bare class="gap-1.5 text-label-sm text-outline" onclick={onclear}>
					<Trash2 size={13} />
					Clear all
				</Button>
				<span class="flex items-center gap-1.5 text-label-sm font-label text-tertiary">
					<Check size={13} />
					Saved locally
				</span>
			</div>
		{/if}
	</div>
{/if}