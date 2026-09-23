<script lang="ts">
	import { LockKeyhole } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	let { blocked, label = 'Blocked by unfinished tasks' }: { blocked: boolean; label?: string } = $props();
</script>

{#if blocked}
	<span class="inline-flex items-center gap-1 rounded-md bg-error/10 px-1.5 py-0.5 text-code-sm font-code text-error" title={label}>
		<LockKeyhole size={11} />
		<span>Blocked</span>
	</span>
{/if}
