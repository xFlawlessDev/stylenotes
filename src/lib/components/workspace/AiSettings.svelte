<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Bot,
		Check,
		Eye,
		EyeOff,
		KeyRound,
		ShieldAlert,
		ShieldCheck,
		Sparkles,
		TriangleAlert,
		Zap
	} from '@lucide/svelte';
	import { Button, ChoiceTile, Field, Input, Select, Slider, Switch } from '$lib/components/base';
	import {
		AI_MAX_TEMPERATURE,
		AI_MAX_MAX_TOKENS,
		AI_MIN_MAX_TOKENS,
		AI_MIN_TEMPERATURE,
		AI_PROVIDERS,
		type AiProviderId,
		type AiTestResult
	} from '$lib/content/ai-types';
	import { MCP_SCOPES } from '$lib/content/mcp-tools';
	import {
		activeProvider,
		aiStore,
		clearAiKey,
		hydrateAi,
		testAiConnection,
		toggleAiScope,
		updateAiGrant,
		updateAiSettings
	} from '$lib/stores/ai.svelte';

	let keyField = $state('');
	let revealKey = $state(false);
	let testing = $state(false);
	let test = $state<AiTestResult | null>(null);
	// Text fields keep a local draft and commit on blur/Enter: writing to the
	// database on every keystroke would be needlessly chatty.
	let baseUrlDraft = $state('');
	let modelDraft = $state('');
	let temperatureDraft = $state(0.7);
	let maxTokensDraft = $state('1024');
	let draftsSeeded = $state(false);

	const providerOptions = AI_PROVIDERS.map((item) => ({ value: item.id, label: item.label }));
	const provider = $derived(activeProvider());
	const baseUrlPlaceholder = $derived(provider.defaultBaseUrl);
	const modelPlaceholder = $derived(provider.defaultModel);
	const temperatureLabel = $derived(temperatureDraft.toFixed(1));

	// Seed the drafts once the store has hydrated (or immediately offline).
	$effect(() => {
		if (!draftsSeeded && aiStore.hydrated) {
			baseUrlDraft = aiStore.settings.baseUrl;
			modelDraft = aiStore.settings.model;
			temperatureDraft = aiStore.settings.temperature;
			maxTokensDraft = String(aiStore.settings.maxTokens);
			draftsSeeded = true;
		}
	});

	onMount(() => {
		void hydrateAi();
	});

	async function pickProvider(id: AiProviderId) {
		test = null;
		// Clear the fields so the new provider's defaults apply.
		baseUrlDraft = '';
		modelDraft = '';
		await updateAiSettings({ provider: id, baseUrl: '', model: '' });
	}

	async function commitBaseUrl() {
		if (baseUrlDraft === aiStore.settings.baseUrl) return;
		test = null;
		await updateAiSettings({ baseUrl: baseUrlDraft.trim() });
	}

	async function commitModel() {
		if (modelDraft === aiStore.settings.model) return;
		test = null;
		await updateAiSettings({ model: modelDraft.trim() });
	}

	async function commitMaxTokens() {
		const parsed = Number(maxTokensDraft);
		const clamped = Number.isFinite(parsed)
			? Math.min(AI_MAX_MAX_TOKENS, Math.max(AI_MIN_MAX_TOKENS, Math.round(parsed)))
			: aiStore.settings.maxTokens;
		maxTokensDraft = String(clamped);
		if (clamped === aiStore.settings.maxTokens) return;
		await updateAiSettings({ maxTokens: clamped });
	}

	async function saveKey() {
		if (!keyField.trim()) return;
		const ok = await updateAiSettings({}, keyField.trim());
		if (ok) {
			keyField = '';
			revealKey = false;
			test = null;
		}
	}

	async function removeKey() {
		await clearAiKey();
		keyField = '';
		test = null;
	}

	async function runTest() {
		testing = true;
		test = null;
		try {
			test = await testAiConnection();
		} finally {
			testing = false;
		}
	}
</script>

<div class="flex min-w-0 flex-col gap-6">
	<div class="flex flex-col gap-2.5">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase">AI assistant</span>

		<div class="glass-well flex items-center gap-3 rounded-2xl p-3">
			<div
				class="flex size-9 items-center justify-center rounded-2xl {aiStore.settings.enabled
					? 'bg-primary-container text-on-primary-container'
					: 'bg-surface-container text-outline'}"
			>
				<Bot size={17} />
			</div>
			<div class="flex min-w-0 flex-1 flex-col">
				<span class="text-headline-sm font-headline text-on-surface">
					{aiStore.settings.enabled ? 'AI is on' : 'AI is off'}
				</span>
				<span class="truncate text-label-sm font-label text-outline">
					{aiStore.settings.enabled
						? `${provider.label} · ${aiStore.settings.model || provider.defaultModel}`
						: 'Bring your own key to enable writing help'}
				</span>
			</div>
			<Switch
				checked={aiStore.settings.enabled}
				label="Enable the AI assistant"
				onchange={(checked) => void updateAiSettings({ enabled: checked })}
			/>
		</div>

		<p class="text-label-sm font-label leading-relaxed text-outline">
			The free tier is bring-your-own-key. Your key is encrypted on this device and sent only to
			the provider you choose — never to us.
		</p>
	</div>

	{#if aiStore.settings.enabled}
		<Field label="Provider" legend class="gap-2.5">
			<Select
				label="AI provider"
				options={providerOptions}
				value={aiStore.settings.provider}
				onchange={(next) => void pickProvider(next as AiProviderId)}
			/>
			<span class="text-label-sm font-label leading-relaxed text-outline">{provider.hint}</span>
		</Field>

		<div class="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest/30 p-3">
			<Field label="API key">
				<div class="flex items-center gap-2">
					<Input
						type={revealKey ? 'text' : 'password'}
						aria-label="API key"
						placeholder={aiStore.settings.hasKey ? '•••••••• stored' : 'Paste your key'}
						bind:value={keyField}
						autocomplete="off"
						spellcheck={false}
						onkeydown={(event) => {
							if (event.key === 'Enter') void saveKey();
						}}
					/>
					<Button
						size="icon"
						shape="pill"
						variant="ghost"
						aria-label={revealKey ? 'Hide key' : 'Show key'}
						onclick={() => (revealKey = !revealKey)}
					>
						{#if revealKey}<EyeOff size={15} />{:else}<Eye size={15} />{/if}
					</Button>
				</div>
				<div class="flex items-center justify-between gap-2">
					<span class="flex items-center gap-1.5 text-label-sm font-label text-outline">
						{#if aiStore.settings.hasKey}
							<Check size={13} class="text-tertiary" /> A key is stored on this device
						{:else}
							<KeyRound size={13} /> No key stored yet
						{/if}
					</span>
					<div class="flex items-center gap-1.5">
						{#if aiStore.settings.hasKey}
							<Button variant="ghost" size="xs" shape="pill" onclick={() => void removeKey()}>
								Remove
							</Button>
						{/if}
						<Button
							variant="secondary"
							size="xs"
							shape="pill"
							disabled={!keyField.trim()}
							onclick={() => void saveKey()}
						>
							Save key
						</Button>
					</div>
				</div>
			</Field>

			<Field label="Base URL">
				<Input
					aria-label="Base URL"
					placeholder={baseUrlPlaceholder}
					bind:value={baseUrlDraft}
					spellcheck={false}
					onblur={() => void commitBaseUrl()}
					onkeydown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur();
					}}
				/>
			</Field>

			<Field label="Model">
				<Input
					aria-label="Model"
					placeholder={modelPlaceholder}
					bind:value={modelDraft}
					spellcheck={false}
					onblur={() => void commitModel()}
					onkeydown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur();
					}}
				/>
			</Field>
		</div>

		<div class="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest/30 p-3">
			<div class="flex flex-col gap-1.5">
				<div class="flex items-center justify-between">
					<span class="text-body-md font-body text-on-surface">Temperature</span>
					<span class="text-label-sm font-label text-outline">{temperatureLabel}</span>
				</div>
				<Slider
					label="Temperature"
					min={AI_MIN_TEMPERATURE}
					max={AI_MAX_TEMPERATURE}
					step={0.1}
					bind:value={temperatureDraft}
					onchange={(value) => void updateAiSettings({ temperature: value })}
				/>
			</div>
			<Field label="Max tokens">
				<Input
					type="number"
					aria-label="Max tokens"
					min={AI_MIN_MAX_TOKENS}
					max={AI_MAX_MAX_TOKENS}
					bind:value={maxTokensDraft}
					onblur={() => void commitMaxTokens()}
					onkeydown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur();
					}}
				/>
			</Field>
		</div>

		<Field label="Tools" legend class="gap-2.5">
			<div class="grid grid-cols-2 gap-2">
				<ChoiceTile
					layout="stack"
					icon={ShieldCheck}
					label="Read only"
					class="py-3"
					active={aiStore.settings.access === 'read'}
					onclick={() => void updateAiGrant({ access: 'read', scopes: [] })}
				/>
				<ChoiceTile
					layout="stack"
					icon={ShieldAlert}
					label="Allow writes"
					class="py-3"
					active={aiStore.settings.access === 'write'}
					onclick={() => void updateAiGrant({ access: 'write' })}
				/>
			</div>
			<span class="text-label-sm font-label leading-relaxed text-outline">
				Tools let the assistant read and change your notes and tasks. Reads are always allowed;
				writes ask for confirmation before they run.
			</span>
		</Field>

		{#if aiStore.settings.access === 'write'}
			<div class="flex flex-col gap-2">
				<span class="text-label-sm font-label text-outline">What the assistant may change</span>
				{#each MCP_SCOPES as scope (scope.id)}
					<div class="flex items-center justify-between rounded-2xl bg-surface-container-lowest/30 p-3">
						<span class="flex flex-col">
							<span class="text-body-md font-body text-on-surface">{scope.label}</span>
							<span class="text-label-sm font-label text-outline">{scope.description}</span>
						</span>
						<Switch
							checked={aiStore.settings.scopes.includes(scope.id)}
							label="Allow {scope.label}"
							onchange={(checked) => void toggleAiScope(scope.id, checked)}
						/>
					</div>
				{/each}
			</div>
		{/if}

		<div class="flex flex-col gap-2">
			<Button
				variant="secondary"
				size="md"
				shape="tile"
				block
				class="justify-center"
				disabled={testing || !aiStore.settings.hasKey}
				onclick={() => void runTest()}
			>
				<Zap size={14} />
				{testing ? 'Testing…' : 'Test connection'}
			</Button>

			{#if test}
				<div
					class="flex items-start gap-2 rounded-2xl p-3 {test.ok
						? 'bg-tertiary-container/30'
						: 'bg-error-container/30'}"
				>
					{#if test.ok}
						<Sparkles size={15} class="mt-0.5 shrink-0 text-tertiary" />
					{:else}
						<TriangleAlert size={15} class="mt-0.5 shrink-0 text-error" />
					{/if}
					<span class="text-body-sm font-body {test.ok ? 'text-on-surface' : 'text-on-error-container'}">
						{test.message}
					</span>
				</div>
			{/if}

			{#if aiStore.error}
				<span class="text-label-sm font-label text-error">{aiStore.error}</span>
			{/if}
		</div>
	{/if}
</div>
