<script lang="ts">
	import { Folder, FolderCog } from '@lucide/svelte';
	import { Button, Select } from '$lib/components/base';
	import { workspaceColorClass } from '$lib/workspace';
	import ManageWorkspacesDialog from '$lib/components/workspace/ManageWorkspacesDialog.svelte';

	let { activeId, workspaces, onchange, oncreate, onrename, ondelete }: {
		activeId: string;
		workspaces: { id: string; name: string; color: string }[];
		onchange?: (id: string) => void;
		oncreate?: (name: string) => boolean | Promise<boolean>;
		onrename?: (id: string, name: string) => boolean | Promise<boolean>;
		ondelete?: (id: string) => boolean | Promise<boolean>;
	} = $props();

	/** Dropdown state, bound to the select so the footer can close it first. */
	let open = $state(false);
	let manageOpen = $state(false);

	const options = $derived(
		workspaces.map((workspace) => ({
			value: workspace.id,
			label: workspace.name,
			icon: Folder,
			iconClass: workspaceColorClass(workspace.color),
		}))
	);
</script>

<div class="flex min-w-0 items-center gap-1.5" data-workspace-switcher>
	<Select
		bind:open
		value={activeId}
		{options}
		label="Workspace"
		variant="chip"
		size="sm"
		class="max-w-[170px] border-0"
		onchange={(id) => onchange?.(id)}
	>
		{#snippet footer()}
			<Button
				variant="ghost"
				size="sm"
				class="w-full justify-start gap-2 pl-2 font-normal"
				onclick={() => {
					open = false;
					manageOpen = true;
				}}
			>
				<FolderCog size={14} class="text-outline" />
				Manage workspaces…
			</Button>
		{/snippet}
	</Select>

	<ManageWorkspacesDialog
		bind:open={manageOpen}
		{workspaces}
		{activeId}
		{oncreate}
		{onrename}
		{ondelete}
	/>
</div>
