<script lang="ts">
	import { Brain, X } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * Shown in the chat when a semantic tool failed because no embedder is
	 * selected: the one moment the user is looking straight at the problem, so
	 * the button takes them to the setting that fixes it rather than making
	 * them read an error and go hunting.
	 */
	let {
		onopen,
		ondismiss
	}: {
		/** Opens Settings on the Memory section. */
		onopen: () => void;
		ondismiss: () => void;
	} = $props();
</script>

<div class="flex items-start gap-2 rounded-xl bg-secondary-container/40 p-2.5">
	<Brain size={14} class="mt-0.5 shrink-0 text-on-secondary-container" aria-hidden="true" />
	<div class="flex min-w-0 flex-1 flex-col gap-1.5">
		<span class="text-label-sm font-label text-on-surface">{t('ai.memoryNudge')}</span>
		<div class="flex items-center gap-1.5">
			<Button size="xs" shape="pill" variant="secondary" onclick={onopen}>
				{t('ai.memoryNudgeOpen')}
			</Button>
			<Button size="xs" shape="pill" variant="ghost" onclick={ondismiss}>
				<X size={12} /> {t('ai.memoryNudgeDismiss')}
			</Button>
		</div>
	</div>
</div>
