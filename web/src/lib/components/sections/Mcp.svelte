<script lang="ts">
	import Plug from '@lucide/svelte/icons/plug';
	import { site } from '#lib/site.js';

	const exposure = [
		{
			label: 'This device',
			reach: 'Processes on your machine',
			note: 'Loopback only — the default.'
		},
		{
			label: 'Local network',
			reach: 'Another device you own',
			note: 'Explicit confirmation; one private interface, never 0.0.0.0.'
		},
		{
			label: 'Tunnel',
			reach: 'Through your own tunnel',
			note: 'The endpoint stays on loopback.'
		}
	];

	const guarantees = [
		'Writes go through the app, never around it',
		'Read-only until you grant writes',
		'Guarded against DNS rebinding',
		'Settings are device-local and the token is encrypted at rest'
	];
</script>

<section id="mcp" class="anchor-offset border-b border-border/60 bg-surface-container-lowest/40">
	<div class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
		<div class="grid gap-10 lg:grid-cols-[1fr_1.35fr] lg:gap-16">
			<div>
				<h2 class="flex items-start gap-2.5 text-headline-lg text-foreground sm:text-headline-xl">
					<Plug class="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
					Connect an AI assistant, on your terms
				</h2>
				<p class="mt-3 text-body-lg text-on-surface-variant">
					StyleNotes ships a local MCP server built into the app. Claude Desktop, Cursor,
					or your own client can search and read your notes, and — with your permission —
					write back. It is off by default.
				</p>
				<p class="mt-3 text-body-sm text-on-surface-variant">
					One endpoint over Streamable HTTP, guarded by a bearer token. Every tool and its
					error contract are documented in the
					<a
						href="{site.repo}/tree/main/skills/stylenotes-mcp"
						class="text-primary hover:underline"
						target="_blank"
						rel="noreferrer">MCP skill</a
					>.
				</p>
			</div>

			<div class="grid gap-6">
				<!--
					Stacked rows instead of a table: two columns of prose do not fit a
					320px viewport, and a horizontally scrolling table hides the second
					column behind a gesture nobody expects.
				-->
				<dl class="divide-y divide-border/60 border-y border-border/60">
					{#each exposure as row (row.label)}
						<div class="py-4">
							<dt class="text-body-md font-medium text-foreground">{row.label}</dt>
							<dd class="mt-1 text-body-sm text-on-surface-variant">
								{row.reach}
								<span class="mt-0.5 block text-label-sm text-outline">{row.note}</span>
							</dd>
						</div>
					{/each}
				</dl>

				<ul class="grid gap-2 text-body-sm text-on-surface-variant sm:grid-cols-2">
					{#each guarantees as guarantee (guarantee)}
						<li class="flex gap-2">
							<span
								class="mt-1.5 size-1 shrink-0 rounded-full bg-on-surface-variant"
								aria-hidden="true"
							></span>
							{guarantee}
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>
</section>
