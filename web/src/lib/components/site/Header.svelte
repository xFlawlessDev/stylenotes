<script lang="ts">
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import { site } from '#lib/site.js';
	import Button from '#lib/components/base/button.svelte';
	import GithubMark from './GithubMark.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	const links = [
		{ href: '/#features', label: 'Features' },
		{ href: '/#tour', label: 'Screens' },
		{ href: '/#mcp', label: 'MCP' },
		{ href: '/#privacy', label: 'Privacy' },
		{ href: '/download', label: 'Download' }
	];

	let open = $state(false);
</script>

<!--
	Solid, not blurred: blur is spent once, on the hero screenshot (R-10). The
	header is 56px so it does not letterbox a phone screen (R-03).
-->
<header class="sticky top-0 z-50 border-b border-border/60 bg-background">
	<div class="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
		<a
			href="/"
			class="tap-target flex items-center gap-2.5 pr-2"
			aria-label="{site.name} home"
		>
			<!--
				32×32 is the icon's real size, so this is a 2 KB request rather than
				the 54 KB 256px logo scaled down to 28px.
			-->
			<img src="/favicon.png" alt="" width="32" height="32" class="size-7 rounded-md" />
			<span class="text-headline-sm text-foreground">{site.name}</span>
		</a>

		<nav class="ml-auto hidden items-center gap-1 md:flex" aria-label="Main">
			{#each links as link (link.href)}
				<a
					href={link.href}
					class="tap-target flex items-center rounded-lg px-3 text-label-md text-on-surface-variant transition-colors hover:bg-surface-container/50 hover:text-on-surface"
				>
					{link.label}
				</a>
			{/each}
		</nav>

		<div class="ml-auto flex items-center gap-1 md:ml-2">
			<a
				href={site.repo}
				class="tap-target hidden items-center justify-center sm:flex"
				target="_blank"
				rel="noreferrer"
				aria-label="StyleNotes on GitHub"
			>
				<Button variant="ghost" size="icon-lg" shape="pill" tabindex={-1}>
					<GithubMark class="size-4" />
				</Button>
			</a>
			<ThemeToggle />
			<Button
				variant="ghost"
				size="icon-lg"
				shape="pill"
				class="tap-target md:hidden"
				aria-expanded={open}
				aria-controls="mobile-nav"
				onclick={() => (open = !open)}
			>
				{#if open}
					<X class="size-4" />
				{:else}
					<Menu class="size-4" />
				{/if}
				<span class="sr-only">{open ? 'Close menu' : 'Menu'}</span>
			</Button>
		</div>
	</div>

	{#if open}
		<nav id="mobile-nav" class="border-t border-border/60 md:hidden" aria-label="Main">
			<div class="mx-auto flex w-full max-w-6xl flex-col px-2 py-2">
				{#each links as link (link.href)}
					<a
						href={link.href}
						class="flex min-h-11 items-center rounded-lg px-3 text-body-md text-on-surface-variant hover:bg-surface-container/50 hover:text-on-surface"
						onclick={() => (open = false)}
					>
						{link.label}
					</a>
				{/each}
				<a
					href={site.repo}
					class="flex min-h-11 items-center rounded-lg px-3 text-body-md text-on-surface-variant hover:bg-surface-container/50 hover:text-on-surface"
					target="_blank"
					rel="noreferrer"
				>
					Source on GitHub
				</a>
			</div>
		</nav>
	{/if}
</header>
