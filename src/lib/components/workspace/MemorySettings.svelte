<script lang="ts">
	import { Button, Field, Select, Slider, type SelectOption } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { MEMORY_DEFAULT_THRESHOLD } from '$lib/content/memory-types';
	import {
		buildClusters,
		buildIndex,
		downloadModel,
		findContradictions,
		memoryStore,
		memoryStatus,
		selectedEmbedder,
		setEmbedder,
		setThreshold,
		stopIndexing
	} from '$lib/stores/memory.svelte';

	/**
	 * Memory settings (docs/design/constella-features.md #Q1).
	 *
	 * Its own section, not part of AI: the embedder, index status, rebuild and
	 * thresholds are a different weight of configuration from a chat key.
	 *
	 * The offline baseline is labelled as what it is (#D2): a lexical baseline,
	 * not meaning retrieval. Presenting it as "semantic" would set the wrong
	 * expectation and cost the feature its trust.
	 */
	let busy = $state(false);

	const embedderOptions = $derived<SelectOption[]>(
		memoryStore.embedders.map((embedder) => ({
			value: embedder.id,
			label: `${embedder.label} (${embedder.dim})`
		}))
	);

	const status = $derived(memoryStatus());
	const current = $derived(selectedEmbedder());
	const isBaseline = $derived(current?.kind === 'hashing');

	async function chooseEmbedder(id: string) {
		if (busy) return;
		busy = true;
		await setEmbedder(id || null);
		busy = false;
	}

	async function rebuild() {
		if (busy || memoryStore.indexing) return;
		busy = true;
		await buildIndex();
		busy = false;
	}

	async function recomputeThemes() {
		if (busy) return;
		busy = true;
		await buildClusters();
		busy = false;
	}

	async function scanContradictions() {
		if (busy) return;
		busy = true;
		await findContradictions();
		busy = false;
	}

	async function getModel() {
		if (busy || memoryStore.downloading) return;
		busy = true;
		await downloadModel();
		busy = false;
	}

	/** A compact byte size for the progress label, e.g. `12.3 MB`. */
	function formatBytes(bytes: number): string {
		if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
		const value = bytes / 1024 ** exponent;
		return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
	}

	const isOnnx = $derived(memoryStore.selected?.startsWith('onnx:') ?? false);
	const needsModel = $derived(isOnnx && !memoryStore.modelDownloaded);
</script>

<div class="flex min-w-0 flex-col gap-6">
	<Field label={t('settings.memory.embedder')} class="gap-2.5">
		<Select
			label={t('settings.memory.embedder')}
			options={embedderOptions}
			value={memoryStore.selected ?? ''}
			size="lg"
			placeholder={t('settings.memory.embedderOff')}
			onchange={(next) => chooseEmbedder(next)}
		/>
		<span class="text-label-sm font-label text-outline">
			{t('settings.memory.embedderHint')}
		</span>
	</Field>

	{#if memoryStore.selected}
		{#if isOnnx && !memoryStore.modelRuntimeFound}
			<div class="flex items-start gap-2 rounded-2xl bg-error-container/20 p-3">
				<span class="text-label-sm font-label text-error">
					{t('settings.memory.runtimeMissing')}
				</span>
			</div>
		{:else if needsModel}
			<div
				class="flex flex-col gap-2 rounded-2xl bg-surface-container-lowest/40 p-3 ring-1 ring-inset ring-outline-variant/40"
			>
				<span class="text-label-sm font-label text-outline">
					{t('settings.memory.modelMissing')}
				</span>
				<Button
					variant="primary"
					size="md"
					class="self-start"
					disabled={busy || memoryStore.downloading}
					onclick={getModel}
				>
					{memoryStore.downloading
						? t('settings.memory.downloading')
						: t('settings.memory.downloadModel')}
				</Button>
				{#if memoryStore.downloading}
					<div class="flex flex-col gap-1" role="progressbar"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={memoryStore.downloadPercent ?? undefined}
					>
						<div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
							<div
								class="h-full rounded-full bg-primary transition-[width] duration-200 {memoryStore.downloadPercent ===
								null
									? 'w-1/3 animate-pulse'
									: ''}"
								style={memoryStore.downloadPercent === null
									? ''
									: `width: ${memoryStore.downloadPercent}%`}
							></div>
						</div>
						<span class="text-label-sm font-label text-outline">
							{memoryStore.downloadPercent === null
								? t('settings.memory.downloadBytes', {
										done: formatBytes(memoryStore.downloadWritten),
										total: '?'
									})
								: t('settings.memory.downloadPercent', {
										percent: memoryStore.downloadPercent,
										done: formatBytes(memoryStore.downloadWritten),
										total: formatBytes(memoryStore.downloadTotal ?? 0)
									})}
						</span>
					</div>
				{/if}
			</div>
		{/if}

		{#if isBaseline}
			<div
				class="rounded-2xl bg-surface-container-lowest/40 p-3 ring-1 ring-inset ring-outline-variant/40"
			>
				<span class="text-label-sm font-label text-outline">
					{t('settings.memory.baselineNotice')}
				</span>
			</div>
		{/if}

		<div
			class="flex flex-col gap-1 rounded-2xl bg-surface-container-lowest/40 p-3 ring-1 ring-inset ring-outline-variant/40"
		>
			<span class="text-label-sm font-label text-outline">
				{t('settings.memory.status', {
					indexed: status.indexed,
					pending: status.pending
				})}
			</span>
			{#if status.lastError}
				<span class="text-label-sm font-label text-error">{status.lastError}</span>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Button
				variant="primary"
				size="md"
				disabled={busy || memoryStore.indexing || needsModel || (isOnnx && !memoryStore.modelRuntimeFound)}
				onclick={rebuild}
			>
				{memoryStore.indexing
					? t('settings.memory.indexing')
					: t('settings.memory.buildIndex')}
			</Button>
			{#if memoryStore.indexing}
				<Button variant="outline" size="md" onclick={stopIndexing}>
					{t('settings.memory.stop')}
				</Button>
			{/if}
			<Button variant="secondary" size="md" disabled={busy} onclick={recomputeThemes}>
				{t('settings.memory.rebuildThemes')}
			</Button>
			<Button variant="secondary" size="md" disabled={busy} onclick={scanContradictions}>
				{t('settings.memory.findContradictions')}
			</Button>
		</div>

		<Field label={t('settings.memory.threshold')} class="gap-2.5">
			<Slider
				min={0}
				max={1}
				step={0.01}
				value={memoryStore.threshold}
				label={t('settings.memory.threshold')}
				onchange={(value) => void setThreshold(value)}
			/>
			<span class="text-label-sm font-label text-outline">
				{t('settings.memory.thresholdHint', {
					value: memoryStore.threshold.toFixed(2),
					default: MEMORY_DEFAULT_THRESHOLD.toFixed(2)
				})}
			</span>
		</Field>
	{/if}
</div>
