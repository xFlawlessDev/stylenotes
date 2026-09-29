<script lang="ts">
	import { tick } from 'svelte';
	import { Input } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';

	let {
		title = $bindable(''),
		idPrefix = 'task',
		autofocus = false
	}: {
		title?: string;
		idPrefix?: string;
		autofocus?: boolean;
	} = $props();

	let inputEl = $state<HTMLInputElement | null>(null);
	let focusedOnce = false;

	$effect(() => {
		if (!autofocus || focusedOnce) return;
		focusedOnce = true;
		void tick().then(() => inputEl?.focus());
	});
</script>

<Input
	id="{idPrefix}-title"
	bind:ref={inputEl}
	bind:value={title}
	variant="bare"
	size="sm"
	class="shrink-0 px-1.5 font-headline text-headline-sm font-bold tracking-tight placeholder:text-outline/60"
	placeholder={t('tasks.form.titlePlaceholder')}
	aria-label={t('tasks.form.titleLabel')}
/>
