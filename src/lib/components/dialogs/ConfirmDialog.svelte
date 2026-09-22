<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button, type ButtonVariant } from '$lib/components/base';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		description,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		confirmVariant = 'danger',
		icon,
		onconfirm,
		oncancel,
	}: {
		open?: boolean;
		title: string;
		description: string;
		confirmLabel?: string;
		cancelLabel?: string;
		confirmVariant?: ButtonVariant;
		icon?: Snippet;
		onconfirm?: () => void;
		oncancel?: () => void;
	} = $props();

	function cancel() {
		open = false;
		oncancel?.();
	}

	function confirm() {
		open = false;
		onconfirm?.();
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content class="glass-dialog">
		<AlertDialog.Header>
			{#if icon}
				<div
					class="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-container text-error"
				>
					{@render icon()}
				</div>
			{/if}
			<AlertDialog.Title class="text-headline-md font-headline text-on-surface">
				{title}
			</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>

		<AlertDialog.Footer
			class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
		>
			<Button variant="outline" onclick={cancel}>{cancelLabel}</Button>
			<Button variant={confirmVariant} onclick={confirm}>{confirmLabel}</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
