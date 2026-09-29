<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Bot,
		Check,
		Eye,
		EyeOff,
		Globe,
		KeyRound,
		ShieldAlert,
		ShieldCheck,
		Sparkles,
		TriangleAlert,
		Zap
	} from '@lucide/svelte';
	import { Button, ChoiceTile, Field, Input, Select, Slider, Switch } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
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
		updateAiSettings,
		updateSearchKey,
		updateSearchSettings
	} from '$lib/stores/ai.svelte';
	import { loadSearchProviders, searchProviderList } from '$lib/stores/ai-web.svelte';

	let keyField = $state('');
	let revealKey = $state(false);
	let testing = $state(false);
	let test = $state<AiTestResult | null>(null);
	let searchKeyField = $state('');
	let revealSearchKey = $state(false);
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
	const providerHint = $derived(
		provider.id === 'anthropic-native'
			? t('settings.ai.providerHints.anthropic')
			: t('settings.ai.providerHints.openaiCompatible')
	);
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
		void loadSearchProviders();
	});

	const searchProviderOptions = $derived(
		searchProviderList.items.map((item) => ({ value: item.id, label: item.label }))
	);
	const searchProviderHint = $derived(
		searchProviderList.items.find((item) => item.id === aiStore.settings.searchProvider)?.hint ?? ''
	);

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

	async function saveSearchKey() {
		if (!searchKeyField.trim()) return;
		const ok = await updateSearchKey(searchKeyField.trim());
		if (ok) {
			searchKeyField = '';
			revealSearchKey = false;
		}
	}

	async function removeSearchKey() {
		await updateSearchKey('');
		searchKeyField = '';
	}
</script>

<div class="flex min-w-0 flex-col gap-6">
	<div class="flex flex-col gap-2.5">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase"
		>{t('settings.ai.title')}</span
	>

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
					{aiStore.settings.enabled ? t('settings.ai.on') : t('settings.ai.off')}
				</span>
				<span class="truncate text-label-sm font-label text-outline">
					{aiStore.settings.enabled
						? `${provider.label} · ${aiStore.settings.model || provider.defaultModel}`
						: t('settings.ai.offHint')}
				</span>
			</div>
			<Switch
				checked={aiStore.settings.enabled}
				label={t('settings.ai.enableLabel')}
				onchange={(checked) => void updateAiSettings({ enabled: checked })}
			/>
		</div>

		<p class="text-label-sm font-label leading-relaxed text-outline">
			{t('settings.ai.byok')}
		</p>
	</div>

	{#if aiStore.settings.enabled}
		<Field label={t('settings.ai.provider')} legend class="gap-2.5">
			<Select
				label={t('settings.ai.providerLabel')}
				options={providerOptions}
				value={aiStore.settings.provider}
				onchange={(next) => void pickProvider(next as AiProviderId)}
			/>
			<span class="text-label-sm font-label leading-relaxed text-outline">{providerHint}</span>
		</Field>

		<div class="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest/30 p-3">
			<Field label={t('settings.ai.apiKey')}>
				<div class="flex items-center gap-2">
					<Input
						type={revealKey ? 'text' : 'password'}
						aria-label={t('settings.ai.apiKeyLabel')}
						placeholder={aiStore.settings.hasKey
							? t('settings.ai.keyPlaceholderStored')
							: t('settings.ai.keyPlaceholderPaste')}
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
						aria-label={revealKey ? t('settings.ai.hideKey') : t('settings.ai.showKey')}
						onclick={() => (revealKey = !revealKey)}
					>
						{#if revealKey}<EyeOff size={15} />{:else}<Eye size={15} />{/if}
					</Button>
				</div>
				<div class="flex items-center justify-between gap-2">
					<span class="flex items-center gap-1.5 text-label-sm font-label text-outline">
						{#if aiStore.settings.hasKey}
							<Check size={13} class="text-tertiary" /> {t('settings.ai.keyStored')}
						{:else}
							<KeyRound size={13} /> {t('settings.ai.keyMissing')}
						{/if}
					</span>
					<div class="flex items-center gap-1.5">
						{#if aiStore.settings.hasKey}
							<Button variant="ghost" size="xs" shape="pill" onclick={() => void removeKey()}>
								{t('settings.ai.remove')}
							</Button>
						{/if}
						<Button
							variant="secondary"
							size="xs"
							shape="pill"
							disabled={!keyField.trim()}
							onclick={() => void saveKey()}
						>
							{t('settings.ai.saveKey')}
						</Button>
					</div>
				</div>
			</Field>

			<Field label={t('settings.ai.baseUrl')}>
				<Input
					aria-label={t('settings.ai.baseUrl')}
					placeholder={baseUrlPlaceholder}
					bind:value={baseUrlDraft}
					spellcheck={false}
					onblur={() => void commitBaseUrl()}
					onkeydown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur();
					}}
				/>
			</Field>

			<Field label={t('settings.ai.model')}>
				<Input
					aria-label={t('settings.ai.model')}
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
					<span class="text-body-md font-body text-on-surface">{t('settings.ai.temperature')}</span>
					<span class="text-label-sm font-label text-outline">{temperatureLabel}</span>
				</div>
				<Slider
					label={t('settings.ai.temperature')}
					min={AI_MIN_TEMPERATURE}
					max={AI_MAX_TEMPERATURE}
					step={0.1}
					bind:value={temperatureDraft}
					onchange={(value) => void updateAiSettings({ temperature: value })}
				/>
			</div>
			<Field label={t('settings.ai.maxTokens')}>
				<Input
					type="number"
					aria-label={t('settings.ai.maxTokens')}
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

		<Field label={t('settings.ai.tools')} legend class="gap-2.5">
			<div class="grid grid-cols-2 gap-2">
				<ChoiceTile
					layout="stack"
					icon={ShieldCheck}
					label={t('settings.ai.readOnly')}
					class="py-3"
					active={aiStore.settings.access === 'read'}
					onclick={() => void updateAiGrant({ access: 'read', scopes: [] })}
				/>
				<ChoiceTile
					layout="stack"
					icon={ShieldAlert}
					label={t('settings.ai.allowWrites')}
					class="py-3"
					active={aiStore.settings.access === 'write'}
					onclick={() => void updateAiGrant({ access: 'write' })}
				/>
			</div>
			<span class="text-label-sm font-label leading-relaxed text-outline">
				{t('settings.ai.toolsHint')}
			</span>
		</Field>

		{#if aiStore.settings.access === 'write'}
			<div class="flex flex-col gap-2">
				<span class="text-label-sm font-label text-outline">{t('settings.ai.whatMayChange')}</span>
				{#each MCP_SCOPES as scope (scope.id)}
					<div class="flex items-center justify-between rounded-2xl bg-surface-container-lowest/30 p-3">
						<span class="flex flex-col">
							<span class="text-body-md font-body text-on-surface">{t('settings.mcp.scope.' + scope.id)}</span>
							<span class="text-label-sm font-label text-outline">{t('settings.mcp.scopeDescription.' + scope.id)}</span>
						</span>
						<Switch
							checked={aiStore.settings.scopes.includes(scope.id)}
							label={t('settings.ai.allowScope', { scope: t('settings.mcp.scope.' + scope.id) })}
							onchange={(checked) => void toggleAiScope(scope.id, checked)}
						/>
					</div>
				{/each}
			</div>
		{/if}

		<Field label={t('settings.ai.webSearch')} legend class="gap-2.5">
			<div class="flex items-start gap-2 rounded-2xl bg-surface-container-lowest/30 p-3">
				<Globe size={15} class="mt-0.5 shrink-0 text-outline" />
				<span class="text-label-sm font-label leading-relaxed text-outline">
					{t('settings.ai.webSearchHint')}
				</span>
			</div>

			<Field label={t('settings.ai.provider')}>
				<Select
					label={t('settings.ai.searchProvider')}
					value={aiStore.settings.searchProvider}
					options={[{ value: '', label: t('settings.ai.off') }, ...searchProviderOptions]}
					onchange={(value) => void updateSearchSettings({ searchProvider: value })}
				/>
			</Field>
			{#if searchProviderHint}
				<span class="text-label-sm font-label text-outline">{searchProviderHint}</span>
			{/if}

			{#if aiStore.settings.searchProvider}
				<Field label={t('settings.ai.searchKey')}>
					<div class="flex items-center gap-2">
						<div class="relative flex-1">
							<Input
								type={revealSearchKey ? 'text' : 'password'}
								placeholder={aiStore.settings.hasSearchKey
									? t('settings.ai.searchKeyStored')
									: t('settings.ai.searchKeyPlaceholder')}
								bind:value={searchKeyField}
								onkeydown={(event) => {
									if (event.key === 'Enter') void saveSearchKey();
								}}
							/>
							<Button
								size="icon-sm"
								variant="ghost"
								class="absolute top-0.5 right-0.5"
								aria-label={revealSearchKey ? t('settings.ai.hideKey') : t('settings.ai.showKey')}
								onclick={() => (revealSearchKey = !revealSearchKey)}
							>
								{#if revealSearchKey}<EyeOff size={14} />{:else}<Eye size={14} />{/if}
							</Button>
						</div>
						<Button
							variant="secondary"
							size="md"
							disabled={!searchKeyField.trim()}
							onclick={() => void saveSearchKey()}
						>
							{t('settings.ai.save')}
						</Button>
						{#if aiStore.settings.hasSearchKey}
							<Button variant="danger-ghost" size="md" onclick={() => void removeSearchKey()}>
								{t('settings.ai.remove')}
							</Button>
						{/if}
					</div>
				</Field>
				{#if !aiStore.settings.hasSearchKey}
					<span class="text-label-sm font-label text-outline">
						{t('settings.ai.searchKeyMissing')}
					</span>
				{/if}
			{/if}
		</Field>

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
				{testing ? t('settings.ai.testing') : t('settings.ai.testConnection')}
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
