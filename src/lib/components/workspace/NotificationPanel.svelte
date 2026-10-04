<script lang="ts">
	import {
		Bell,
		BellOff,
		CircleArrowUp,
		Clock,
		CloudCheck,
		Lightbulb,
		AtSign,
		Check,
		Trash2,
		ListTodo,
		Database,
		FolderSync,
		Link2,
		Paperclip,
		NotebookPen,
	} from '@lucide/svelte';
	import type { NotificationKind } from '$lib/stores/notifications';
	import type { NotificationInsight, InsightTarget } from '$lib/content/notification-insights';
	import { t } from '$lib/i18n/index.svelte';
	import { seedNotificationText } from '$lib/content/notification-text';
	import { versionFromUpdateId } from '$lib/content/update-types';
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
		insights = [],
		ontoggle,
		onread,
		onreadall,
		onclear,
		onopenupdate,
		oninsight,
		onclose,
	}: {
		open?: boolean;
		notifications: Notification[];
		/** Live, computed rows; see `content/notification-insights.ts`. */
		insights?: NotificationInsight[];
		ontoggle: () => void;
		onread: (id: string) => void;
		onreadall: () => void;
		onclear: () => void;
		/** Opens Settings on the About section for a version-update notification. */
		onopenupdate?: () => void;
		/** Routes a live insight row to its destination. */
		oninsight?: (target: InsightTarget) => void;
		onclose: () => void;
	} = $props();

	const kindIcon: Record<NotificationKind, typeof Bell> = {
		reminder: Clock,
		sync: CloudCheck,
		tip: Lightbulb,
		mention: AtSign,
		update: CircleArrowUp,
	};

	const kindTone: Record<NotificationKind, string> = {
		reminder: 'text-secondary',
		sync: 'text-tertiary',
		tip: 'text-primary',
		mention: 'text-primary',
		update: 'text-primary',
	};

	const insightIcon: Record<NotificationInsight['id'], typeof Bell> = {
		tasks: ListTodo,
		indexing: Database,
		vault: FolderSync,
		suggestions: Link2,
		attachments: Paperclip,
		journal: NotebookPen,
	};

	const insightTone: Record<NotificationInsight['tone'], string> = {
		primary: 'text-primary',
		secondary: 'text-secondary',
		tertiary: 'text-tertiary',
		error: 'text-error',
	};

	const unreadCount = $derived(notifications.filter((item) => !item.read).length);
	const totalCount = $derived(insights.length + notifications.length);

	/**
	 * Renders a row's copy: app-owned rows are translated from the catalog
	 * (their stored text is frozen at first-run language), everything else
	 * keeps the stored title/body/time.
	 */
	function rowText(item: Notification): { title: string; body: string; time: string } {
		return seedNotificationText(item.id) ?? { title: item.title, body: item.body, time: item.time };
	}

	/**
	 * Marks a row read and, for a version-update row, routes to the About
	 * section where the changelog and the install button live. Every other kind
	 * only marks read, exactly as before.
	 */
	function activate(item: Notification): void {
		onread(item.id);
		if (versionFromUpdateId(item.id)) onopenupdate?.();
	}
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
					aria-label={t('shell.notifications')}
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
		<Tooltip.Content>{t('shell.notifications')}</Tooltip.Content>
	</Tooltip.Root>
</div>

{#if open}
	<button
		class="fixed inset-0 z-40 cursor-default"
		aria-label={t('shell.notification.closeNotifications')}
		onclick={onclose}
	></button>
	<div
		class="glass-solid fixed top-14 right-3 z-50 flex max-h-[440px] w-[352px] flex-col overflow-hidden rounded-2xl"
	>
		<div class="flex items-center justify-between px-3.5 py-3">
			<div class="flex items-center gap-2">
				<span class="text-headline-sm font-headline text-on-surface">{t('shell.notification.panelTitle')}</span>
				{#if unreadCount > 0}
					<span
						class="rounded-full bg-secondary-container px-2 py-0.5 text-label-sm font-label text-on-secondary-container"
						>{t('shell.notification.newCount', { count: unreadCount })}</span
					>
				{/if}
			</div>
			{#if notifications.length > 0}
				<Button
					bare
					class="text-label-sm text-primary hover:brightness-110"
					onclick={onreadall}
				>
					{t('shell.notification.markAllRead')}
				</Button>
			{/if}
		</div>

		<div class="glass-divider h-px"></div>

		<div class="scrollbar-none flex max-h-[300px] flex-1 flex-col overflow-y-auto p-1.5">
			{#if totalCount === 0}
				<EmptyState icon={BellOff} title={t('shell.notification.allCaughtUp')} class="flex-none" />
			{/if}

			{#if insights.length > 0}
				<div class="flex items-center justify-between px-1.5 pt-1 pb-1.5">
					<span class="text-label-sm font-label text-outline">{t('shell.notification.live')}</span>
					<span class="flex items-center gap-1 text-label-sm font-label text-tertiary">
						<span class="size-1.5 animate-pulse rounded-full bg-tertiary"></span>
					</span>
				</div>
				{#each insights as insight (insight.id)}
					{@const Icon = insightIcon[insight.id] ?? Bell}
					<Button
						bare
						class="group relative w-full justify-start gap-3 rounded-xl p-2.5 text-left bg-surface-container/55 hover:bg-surface-container/70"
						onclick={() => oninsight?.(insight.target)}
					>
						<span
							class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-container-high {insightTone[insight.tone]}"
						>
							<Icon size={16} />
						</span>
						<span class="flex min-w-0 flex-col gap-0.5 pr-3">
							<span class="text-label-md font-label font-medium text-on-surface">
								{t(insight.titleKey, insight.titleParams)}
							</span>
							<span class="text-body-sm font-body leading-snug text-on-surface-variant">
								{t(insight.bodyKey, insight.bodyParams)}
							</span>
						</span>
					</Button>
				{/each}
			{/if}

			{#if insights.length > 0 && notifications.length > 0}
				<div class="px-1.5 pt-2.5 pb-1.5">
					<span class="text-label-sm font-label text-outline">{t('shell.notification.recent')}</span>
				</div>
			{/if}

			{#each notifications as item (item.id)}
				{@const Icon = kindIcon[item.kind] ?? Bell}
				{@const copy = rowText(item)}
				<Button
					bare
					class="group relative w-full justify-start gap-3 rounded-xl p-2.5 text-left {item.read
						? 'hover:bg-surface-container/40'
						: 'bg-surface-container/55 hover:bg-surface-container/70'}"
					onclick={() => activate(item)}
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
								: 'text-on-surface'}">{copy.title}</span
						>
						<span class="text-body-sm font-body leading-snug {item.read
							? 'text-outline'
							: 'text-on-surface-variant'}">{copy.body}</span
						>
						<span class="text-code-sm font-code text-outline">{copy.time}</span>
					</span>
				</Button>
			{/each}
		</div>

		{#if totalCount > 0}
			<div class="glass-divider h-px"></div>
			<div class="flex items-center justify-between px-3.5 py-2">
				{#if notifications.length > 0}
					<Button bare class="gap-1.5 text-label-sm text-outline" onclick={onclear}>
						<Trash2 size={13} />
						{t('shell.notification.clearAll')}
					</Button>
				{:else}
					<span></span>
				{/if}
				<span class="flex items-center gap-1.5 text-label-sm font-label text-tertiary">
					<Check size={13} />
					{t('shell.notification.savedLocally')}
				</span>
			</div>
		{/if}
	</div>
{/if}
