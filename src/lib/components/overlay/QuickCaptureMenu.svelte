<script lang="ts">
	import { ListTodo, NotebookPen } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import {
		QUICK_NOTE_LABEL,
		QUICK_TASK_LABEL,
		type QuickCaptureKind
	} from '$lib/stores/shortcuts';

	let {
		oncreate
	}: {
		oncreate: (kind: QuickCaptureKind) => void;
	} = $props();
</script>

<div class="glass-solid flex w-full flex-col gap-0.5 rounded-xl p-1.5 ring-1 ring-hairline shadow-none">
	<span class="px-2 pt-1 pb-0.5 text-label-sm font-label tracking-wider text-outline uppercase">
		Quick capture
	</span>
	<Button
		bare
		class="gap-2 rounded-lg px-2 py-1.5 text-left text-body-sm text-on-surface-variant hover:bg-surface-container-high/70 hover:text-on-surface"
		onclick={() => oncreate('note')}
	>
		<NotebookPen size={15} class="shrink-0 text-tertiary" />
		<span class="flex-1">New note</span>
		<kbd class="text-code-sm font-code text-outline">{QUICK_NOTE_LABEL}</kbd>
	</Button>
	<Button
		bare
		class="gap-2 rounded-lg px-2 py-1.5 text-left text-body-sm text-on-surface-variant hover:bg-surface-container-high/70 hover:text-on-surface"
		onclick={() => oncreate('task')}
	>
		<ListTodo size={15} class="shrink-0 text-secondary" />
		<span class="flex-1">New task</span>
		<kbd class="text-code-sm font-code text-outline">{QUICK_TASK_LABEL}</kbd>
	</Button>
</div>
