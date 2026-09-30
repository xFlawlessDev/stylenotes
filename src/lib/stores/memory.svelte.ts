/**
 * Semantic memory orchestration (docs/design/constella-features.md #D15, #D16).
 *
 * Owns the index lifecycle: which embedder is selected, a cancellable backfill
 * that batches `ai_embed` calls, re-embedding a note when it changes, and the
 * two retrieval reads the tools answer from.
 *
 * Only the `workspace` window runs index work: it is the always-alive window, so
 * there is exactly one writer, exactly like `mcp-host.svelte.ts`. Other windows
 * read the store's published status but never reindex.
 *
 * Degradation is deliberate (#D17): with no embedder or no index the retrieval
 * functions return a clear "not ready" rather than throwing, and the substring
 * search every caller already had keeps working.
 */

import { browser } from '$app/environment';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
	contentHash,
	decodeVectorBase64,
	embedText,
	encodeVectorBase64,
	hashingEmbed
} from '$lib/content/embeddings';
import {
	MEMORY_DEFAULT_CLUSTERS,
	MEMORY_DEFAULT_THRESHOLD,
	MEMORY_EMBED_BATCH,
	MEMORY_HASHING_EMBEDDER,
	MEMORY_META_KEYS,
	MEMORY_PROVIDER_PREFIX,
	type EmbedderDescriptor,
	type MemoryStatus
} from '$lib/content/memory-types';
import { normalizeThreshold, pairKey, rankBySimilarity, refKey, suggestPairs, suggestionReason } from '$lib/content/semantic';
import { suggestionsRepo } from '$lib/db/suggestions';
import { clustersRepo, type ClusterRecord } from '$lib/db/clusters';
import { clusterVectors, type ClusterItem } from '$lib/content/clusters';
import { candidatePairs, contradictionReason, verificationPrompt, verifiedContradictions, type ContradictionItem } from '$lib/content/contradictions';
import { buildWorkspaceGraph, type GraphSuggestion } from '$lib/content/workspace-graph';
import { embeddingsRepo, type EmbeddingRecord } from '$lib/db/embeddings';
import { metaRepo } from '$lib/db/meta';
import { listAllNotes } from '$lib/stores/notes';
import { listAllTasks } from '$lib/stores/tasks.svelte';
import { isTauri, currentWindowRole } from '$lib/windows';

/** Event telling the other windows the memory settings or index changed. */
export const MEMORY_CHANGED = 'memory:changed';

/** Reactive state every window reads; only the workspace writes it. */
export const memoryStore = $state<{
	/** Embedders the current build offers, from Rust. */
	embedders: EmbedderDescriptor[];
	/** The selected embedder id, or null when memory is off. */
	selected: string | null;
	/** Cosine floor for a suggestion. */
	threshold: number;
	/** Target cluster count, used in Phase 2. */
	clusterCount: number;
	indexed: number;
	pending: number;
	indexing: boolean;
	lastError: string | null;
	hydrated: boolean;
	/** Pending auto-link suggestions, newest first (#D7). */
	suggestions: GraphSuggestion[];
	/** Current theme clusters (#D9). */
	themes: ClusterRecord[];
	/** Whether the local ONNX model can run and is downloaded. */
	modelAvailable: boolean;
	modelDownloaded: boolean;
	modelRuntimeFound: boolean;
	modelDetail: string;
	/** True while the model is downloading. */
	downloading: boolean;
	/** 0–100, or null when the server did not report a total. */
	downloadPercent: number | null;
	/** Bytes written so far, for the progress label. */
	downloadWritten: number;
	/** Total bytes, or null when unknown. */
	downloadTotal: number | null;
}>({
	embedders: [],
	selected: null,
	threshold: MEMORY_DEFAULT_THRESHOLD,
	clusterCount: MEMORY_DEFAULT_CLUSTERS,
	indexed: 0,
	modelAvailable: false,
	modelDownloaded: false,
	modelRuntimeFound: false,
	modelDetail: '',
	downloading: false,
	downloadPercent: null,
	downloadWritten: 0,
	downloadTotal: null,
	pending: 0,
	indexing: false,
	lastError: null,
	hydrated: false,
	suggestions: [],
	themes: []
});

let hydrated = false;
let started = false;
let unlisten: UnlistenFn | undefined;
let unlistenDownload: UnlistenFn | undefined;
/** Set by `stopIndexing`; every batch checks it between calls (#D16). */
let cancelled = false;
/** Guards against two concurrent index cycles in the one writer window. */
let running = false;

/** The descriptor for the selected embedder, or null when none is selected. */
export function selectedEmbedder(): EmbedderDescriptor | null {
	return memoryStore.embedders.find((item) => item.id === memoryStore.selected) ?? null;
}

/** True when an index can be built or read with the current selection. */
export function memoryReady(): boolean {
	if (memoryStore.selected === null || memoryStore.embedders.length === 0) return false;
	// A selected local model that cannot run (no runtime or no model) is not
	// ready; the caller is told why by `modelDetail`. The baseline and provider
	// have no such gate.
	if (memoryStore.selected.startsWith('onnx:')) {
		return memoryStore.modelAvailable && memoryStore.modelDownloaded;
	}
	return true;
}

/** A snapshot of the status block for Settings. */
export function memoryStatus(): MemoryStatus {
	return {
		selected: memoryStore.selected,
		indexed: memoryStore.indexed,
		pending: memoryStore.pending,
		indexing: memoryStore.indexing,
		lastError: memoryStore.lastError
	};
}

/** The embedder id a note/task would use, for the current selection. */
function embedderId(): string | null {
	return memoryStore.selected;
}

// --- hydration --------------------------------------------------------------

export async function hydrateMemory(): Promise<void> {
	if (!browser) {
		memoryStore.hydrated = true;
		return;
	}
	if (!hydrated) {
		hydrated = true;
		await loadSelectableEmbedders();
		await refreshModelStatus();
		memoryStore.selected = await metaRepo.get(MEMORY_META_KEYS.embedder).catch(() => null);
		memoryStore.threshold = normalizeThreshold(
			await metaRepo.get(MEMORY_META_KEYS.threshold).catch(() => null),
			MEMORY_DEFAULT_THRESHOLD
		);
		const clusters = await metaRepo.get(MEMORY_META_KEYS.clusterCount).catch(() => null);
		const parsed = clusters ? Number.parseInt(clusters, 10) : NaN;
		if (Number.isFinite(parsed) && parsed > 1) memoryStore.clusterCount = parsed;
		await refreshCounts();
		await refreshSuggestions();
		await refreshThemes();
	}
	memoryStore.hydrated = true;
}

/** Loads the embedder list from Rust, falling back to the offline baseline. */
async function loadSelectableEmbedders(): Promise<void> {
	if (!isTauri) {
		// Browser dev has no ONNX and no provider: offer only the baseline, so
		// the UI is still exercisable (#D17).
		memoryStore.embedders = [MEMORY_HASHING_EMBEDDER];
		return;
	}
	try {
		memoryStore.embedders = await invoke<EmbedderDescriptor[]>('memory_embedders');
	} catch {
		memoryStore.embedders = [MEMORY_HASHING_EMBEDDER];
	}
}

/** Refreshes whether the local model can run and is already downloaded. */
export async function refreshModelStatus(): Promise<void> {
	if (!browser || !isTauri) return;
	try {
		const status = await invoke<{
			available: boolean;
			runtimeFound: boolean;
			modelDownloaded: boolean;
			downloadBytes: number;
			detail: string;
		}>('memory_model_status');
		memoryStore.modelAvailable = status.available;
		memoryStore.modelRuntimeFound = status.runtimeFound;
		memoryStore.modelDownloaded = status.modelDownloaded;
		memoryStore.modelDetail = status.detail;
	} catch {
		memoryStore.modelAvailable = false;
	}
}

/**
 * Downloads the local embedding model. Returns true when it is ready.
 *
 * A no-op when the model is already cached; the Rust side checks first.
 */
export async function downloadModel(): Promise<boolean> {
	if (!browser || !isTauri || memoryStore.downloading) return false;
	memoryStore.downloading = true;
	memoryStore.lastError = null;
	memoryStore.downloadPercent = null;
	memoryStore.downloadWritten = 0;
	memoryStore.downloadTotal = null;
	try {
		await invoke<string>('memory_download_model');
		await refreshModelStatus();
		return memoryStore.modelDownloaded;
	} catch (error) {
		memoryStore.lastError = error instanceof Error ? error.message : String(error);
		return false;
	} finally {
		memoryStore.downloading = false;
		memoryStore.downloadPercent = null;
	}
}

/** Recomputes indexed/pending counts for the selected embedder. */
async function refreshCounts(): Promise<void> {
	const id = embedderId();
	if (!id) {
		memoryStore.indexed = 0;
		memoryStore.pending = 0;
		return;
	}
	const stored = await embeddingsRepo.listByModel(id);
	memoryStore.indexed = stored.filter((row) => row.contentHash).length;
	const sources = await loadSources();
	let pending = 0;
	const byKey = new Map(stored.map((row) => [`${row.entityKind}:${row.entityId}`, row]));
	for (const source of sources) {
		const key = `${source.kind}:${source.id}`;
		const row = byKey.get(key);
		if (!row || row.contentHash !== contentHash(embedText(source))) pending += 1;
	}
	memoryStore.pending = pending;
}

/** Event emitted by Rust while the model downloads (#D3). */
const MEMORY_DOWNLOAD_PROGRESS = 'memory:download-progress';

/** Starts the cross-window listener and the download-progress listener. */
export async function startMemorySync(): Promise<void> {
	if (started || !browser || !isTauri) return;
	started = true;
	unlisten = await listen(MEMORY_CHANGED, () => void hydrateMemory());
	unlistenDownload = await listen<{
		label: string;
		written: number;
		total: number | null;
		percent: number | null;
	}>(MEMORY_DOWNLOAD_PROGRESS, (event) => {
		memoryStore.downloadWritten = event.payload.written;
		memoryStore.downloadTotal = event.payload.total;
		memoryStore.downloadPercent = event.payload.percent;
	});
}

export function stopMemorySync(): void {
	unlisten?.();
	unlistenDownload?.();
	unlisten = undefined;
	unlistenDownload = undefined;
	started = false;
}

function notifyChanged(): void {
	if (!browser || !isTauri) return;
	void emit(MEMORY_CHANGED, { selected: memoryStore.selected }).catch(() => undefined);
}

// --- preferences ------------------------------------------------------------

/** Selects the embedder. Vectors from the old model are ignored, not deleted. */
export async function setEmbedder(id: string | null): Promise<boolean> {
	memoryStore.selected = id;
	try {
		if (id === null) await metaRepo.set(MEMORY_META_KEYS.embedder, '');
		else await metaRepo.set(MEMORY_META_KEYS.embedder, id);
	} catch {
		memoryStore.lastError = 'Could not save the embedder choice';
		return false;
	}
	await refreshCounts();
	notifyChanged();
	return true;
}

export async function setThreshold(value: number): Promise<boolean> {
	const clamped = Math.min(1, Math.max(0, value));
	memoryStore.threshold = clamped;
	try {
		await metaRepo.set(MEMORY_META_KEYS.threshold, String(clamped));
		notifyChanged();
		return true;
	} catch {
		memoryStore.lastError = 'Could not save the similarity threshold';
		return false;
	}
}

// --- indexing (#D16) --------------------------------------------------------

/** The embeddable source of one note or task. */
type Source = { kind: 'note' | 'task'; id: string; title: string; body: string; tags: string[] };

async function loadSources(): Promise<Source[]> {
	const [notes, tasks] = await Promise.all([listAllNotes(), listAllTasks()]);
	return [
		...notes.map((note) => ({
			kind: 'note' as const,
			id: note.id,
			title: note.title,
			body: note.body,
			tags: note.tags
		})),
		...tasks.map((task) => ({
			kind: 'task' as const,
			id: task.id,
			title: task.title,
			body: task.notes,
			tags: [] as string[]
		}))
	];
}

/** Calls `ai_embed`, resolving the provider key only when one is selected. */
async function embedBatch(texts: string[]): Promise<number[][]> {
	const id = embedderId();
	if (!id) throw new Error('no embedder selected');

	// The baseline runs in TS: it needs no model and no runtime, so it works in
	// browser dev too and keeps the whole pipeline testable.
	if (id === MEMORY_HASHING_EMBEDDER.id) return texts.map((text) => hashingEmbed(text));

	const embedder = selectedEmbedder();
	const request: Record<string, unknown> = { embedder: id, texts };
	if (id.startsWith(MEMORY_PROVIDER_PREFIX) && embedder) {
		const { providerConfig } = await import('$lib/stores/ai-settings.svelte');
		const config = await providerConfig();
		request.baseUrl = config.baseUrl;
		request.apiKey = config.apiKey;
		request.dim = embedder.dim;
	}
	const response = await invoke<{ id: string; dim: number; vectors: number[][] }>('ai_embed', {
		request
	});
	return response.vectors;
}

/** Stops the current backfill at the next batch boundary. */
export function stopIndexing(): void {
	cancelled = true;
}

/**
 * Builds or refreshes the whole index for the selected embedder (#D16).
 *
 * Batch of `MEMORY_EMBED_BATCH`, cancellable, and a no-op if a cycle is already
 * running. Only notes whose `content_hash` changed are re-embedded, so a second
 * run after a small edit touches a handful of rows, not the whole vault.
 *
 * With `force`, every stored vector is dropped first and the whole vault is
 * embedded again. That is the "re-index" repair path for a suspect index —
 * a changed model, a corrupt row, or a manual rebuild — and it is safe because
 * the index is a derivative that can always be rebuilt from the notes (#D6).
 */
export async function buildIndex(options: { force?: boolean } = {}): Promise<boolean> {
	if (!browser || running) return false;
	if (currentWindowRole() !== 'workspace' && isTauri) return false;
	if (!memoryReady()) {
		memoryStore.lastError = 'Select an embedder first';
		return false;
	}

	running = true;
	cancelled = false;
	memoryStore.indexing = true;
	memoryStore.lastError = null;
	notifyChanged();

	let ok = true;
	try {
		const id = embedderId()!;
		// A forced rebuild starts from nothing so no row is trusted.
		if (options.force && !(await embeddingsRepo.clear())) {
			throw new Error('Could not clear the old index');
		}
		const sources = await loadSources();
		const stored = options.force
			? new Map<string, EmbeddingRecord>()
			: new Map(
					(await embeddingsRepo.listByModel(id)).map((row) => [
						`${row.entityKind}:${row.entityId}`,
						row
					])
				);

		const stale = sources.filter((source) => {
			const row = stored.get(`${source.kind}:${source.id}`);
			return options.force || !row || row.contentHash !== contentHash(embedText(source));
		});

		for (let offset = 0; offset < stale.length; offset += MEMORY_EMBED_BATCH) {
			if (cancelled) break;
			const batch = stale.slice(offset, offset + MEMORY_EMBED_BATCH);
			const texts = batch.map((source) => embedText(source));
			const vectors = await embedBatch(texts);
			const now = Date.now();
			const writes = batch.map((source, index) => ({
				entityKind: source.kind,
				entityId: source.id,
				model: id,
				dim: vectors[index].length,
				vecBase64: encodeVectorBase64(vectors[index]),
				contentHash: contentHash(texts[index]),
				updatedAt: now
			}));
			const wrote = await embeddingsRepo.putMany(writes);
			if (!wrote) {
				ok = false;
				memoryStore.lastError = 'Could not save the index';
				break;
			}
		}
	} catch (error) {
		ok = false;
		memoryStore.lastError = error instanceof Error ? error.message : String(error);
	} finally {
		running = false;
		memoryStore.indexing = false;
		await refreshCounts();
		notifyChanged();
	}
	// A completed build is the moment suggestions and themes are worth computing:
	// the vectors are fresh and the user is watching the graph (#D7, #D9).
	// Errors are surfaced, not swallowed: a silent failure here is exactly what
	// makes the graph look like the features "do nothing".
	if (ok) {
		try {
			await generateSuggestions();
		} catch (error) {
			memoryStore.lastError = `Suggestions failed: ${message(error)}`;
		}
		try {
			await buildClusters();
		} catch (error) {
			memoryStore.lastError = `Themes failed: ${message(error)}`;
		}
	}
	return ok;
}

/**
 * Re-embeds one entity after it changed. Cheap when the text is unchanged: the
 * `content_hash` comparison short-circuits before any model call (#D5).
 */
export async function reindexEntity(kind: 'note' | 'task', id: string): Promise<boolean> {
	if (!browser || !memoryReady()) return false;
	try {
		const [notes, tasks] = await Promise.all([listAllNotes(), listAllTasks()]);
		const source: Source | undefined =
			kind === 'note'
				? notes
						.filter((note) => note.id === id)
						.map((note) => ({ kind: 'note' as const, id: note.id, title: note.title, body: note.body, tags: note.tags }))[0]
				: tasks
						.filter((task) => task.id === id)
						.map((task) => ({ kind: 'task' as const, id: task.id, title: task.title, body: task.notes, tags: [] }))[0];
		if (!source) {
			await embeddingsRepo.remove(kind, id);
			return true;
		}
		const model = embedderId()!;
		const text = embedText(source);
		const hash = contentHash(text);
		const existing = await embeddingsRepo.get(kind, id);
		if (existing && existing.model === model && existing.contentHash === hash) return true;

		const [vector] = await embedBatch([text]);
		return embeddingsRepo.put({
			entityKind: kind,
			entityId: id,
			model,
			dim: vector.length,
			vecBase64: encodeVectorBase64(vector),
			contentHash: hash,
			updatedAt: Date.now()
		});
	} catch {
		return false;
	}
}

// --- retrieval (the two tools read from here) -------------------------------

/** Every stored vector, decoded, for the ranker. */
async function loadedVectors(): Promise<
	{ entityKind: 'note' | 'task'; entityId: string; vec: number[] }[]
> {
	const id = embedderId();
	if (!id) return [];
	const vectors: { entityKind: 'note' | 'task'; entityId: string; vec: number[] }[] = [];
	for (const row of await embeddingsRepo.listByModel(id)) {
		// The repo already validated the payload length; a null here would mean a
		// race with a rebuild, so skipping is the safe read.
		const vec = decodeVectorBase64(row.vecBase64, row.dim);
		if (!vec) continue;
		vectors.push({ entityKind: row.entityKind, entityId: row.entityId, vec });
	}
	return vectors;
}

/**
 * Semantic search by query text. Returns ranked `{ kind, id, score }` hits, or
 * an empty list when memory is off — callers keep the substring search (#D11).
 */
export async function semanticSearch(
	query: string,
	options: { limit?: number; minScore?: number } = {}
): Promise<{ entityKind: 'note' | 'task'; entityId: string; score: number }[]> {
	if (!browser || !memoryReady() || !query.trim()) return [];
	try {
		const [vector] = await embedBatch([query]);
		const items = await loadedVectors();
		return rankBySimilarity(vector, items, {
			minScore: options.minScore ?? 0,
			limit: options.limit ?? 20
		});
	} catch {
		return [];
	}
}

/** Notes/tasks most similar to one entity, excluding itself. */
export async function relatedNotes(
	kind: 'note' | 'task',
	id: string,
	limit = 8
): Promise<{ entityKind: 'note' | 'task'; entityId: string; score: number }[]> {
	if (!browser || !memoryReady()) return [];
	try {
		const items = await loadedVectors();
		const source = items.find((item) => item.entityKind === kind && item.entityId === id);
		if (!source) return [];
		return rankBySimilarity(source.vec, items, {
			exclude: { entityKind: kind, entityId: id },
			limit
		});
	} catch {
		return [];
	}
}
// --- auto-link suggestions (#D7, #D8) ---------------------------------------

/** Unordered pairs that already have a real edge, keyed by `pairKey`. */
function linkedPairKeys(notes: import('$lib/content/content').Note[], tasks: import('$lib/stores/tasks').Task[]): Set<string> {
	const graph = buildWorkspaceGraph(notes, tasks);
	const keys = new Set<string>();
	for (const edge of graph.edges) {
		const source = splitNodeId(edge.source);
		const target = splitNodeId(edge.target);
		if (!source || !target) continue;
		keys.add(pairKey(source, target));
	}
	return keys;
}

/** `note:abc` → a ref; a shape the graph does not produce yields null. */
function splitNodeId(nodeId: string): { entityKind: 'note' | 'task'; entityId: string } | null {
	const index = nodeId.indexOf(':');
	if (index < 0) return null;
	const kind = nodeId.slice(0, index);
	const id = nodeId.slice(index + 1);
	if (kind === 'note' || kind === 'task') return { entityKind: kind, entityId: id };
	return null;
}

/** Reloads the pending suggestions for the graph overlay. */
export async function refreshSuggestions(): Promise<void> {
	if (!browser) return;
	memoryStore.suggestions = await suggestionsRepo.listPending();
}

/**
 * Computes and stores a fresh batch of auto-link suggestions (#D7, #D8).
 *
 * Runs after an index build, in the writer window only. It proposes; it never
 * writes the graph — an accepted suggestion becomes an edge through the UI.
 * Idempotent: the unique pair index and the `decided` set mean re-running a
 * cycle only adds genuinely new pairs.
 */
export async function generateSuggestions(): Promise<boolean> {
	if (!browser || !memoryReady()) return false;
	if (currentWindowRole() !== 'workspace' && isTauri) return false;
	try {
		const [notes, tasks] = await Promise.all([listAllNotes(), listAllTasks()]);

		const items = await loadedVectors();
		const alreadyLinked = linkedPairKeys(notes, tasks);
		const decided = new Set(
			(await suggestionsRepo.listAll())
				.filter((row) => row.status !== 'pending')
				.map((row) => pairKey(refOf(row.sourceKind, row.sourceId), refOf(row.targetKind, row.targetId)))
		);

		const created: Parameters<typeof suggestionsRepo.insertMany>[0] = [];
		for (const source of items) {
			// Only notes and tasks produce suggestions, and only a note may be the
			// source of a suggestion pair that is not already decided.
			const pairs = suggestPairs(source, items, {
				threshold: memoryStore.threshold,
				alreadyLinked,
				decided
			});
			for (const pair of pairs) {
				created.push({
					id: suggestionId(),
					sourceKind: pair.source.entityKind,
					sourceId: pair.source.entityId,
					targetKind: pair.target.entityKind,
					targetId: pair.target.entityId,
					edgeKind: 'related',
					score: pair.score,
					reason: suggestionReason(pair.score)
				});
				// Mark the pair decided within this run so a later source does not
				// propose the mirror pair (#D8: one entry per unordered pair).
				decided.add(pairKey(pair.source, pair.target));
			}
		}

		const ok = await suggestionsRepo.insertMany(created);
		if (ok) {
			await refreshSuggestions();
			memoryStore.lastError =
				created.length > 0 ? null : 'No similar pairs above the threshold yet.';
		} else {
			memoryStore.lastError = 'Could not save the link suggestions';
		}
		return ok;
	} catch (error) {
		memoryStore.lastError = `Suggestions failed: ${message(error)}`;
		return false;
	}
}

function refOf(kind: 'note' | 'task', id: string) {
	return { entityKind: kind, entityId: id };
}

function suggestionId(): string {
	const webCrypto: Crypto | undefined = globalThis.crypto;
	if (webCrypto && typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID();
	return `sug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Accepts a suggestion: the pair becomes a real `related` edge and the row is
 * marked accepted. The graph section that renders the overlay reacts to the
 * returned `true` and reloads.
 */
export async function acceptSuggestion(id: string): Promise<boolean> {
	const ok = await suggestionsRepo.decide(id, 'accepted');
	if (ok) await refreshSuggestions();
	return ok;
}

/** Rejects a suggestion so the pair is never proposed again (#D8). */
export async function rejectSuggestion(id: string): Promise<boolean> {
	const ok = await suggestionsRepo.decide(id, 'rejected');
	if (ok) await refreshSuggestions();
	return ok;
}

/** Accepted suggestions, resolved for the graph builder. */
export async function acceptedSuggestions(): Promise<GraphSuggestion[]> {
	return (await suggestionsRepo.listAll()).filter((row) => row.status === 'accepted');
}

/** Current themes for the assistant, capped to `limit` clusters. */
export async function themesFor(limit: number): Promise<{ label: string; members: { entityKind: 'note' | 'task'; entityId: string; score: number }[] }[]> {
	const themes = memoryStore.themes.length ? memoryStore.themes : await clustersRepo.list();
	return themes.slice(0, Math.max(1, limit)).map((theme) => ({
		label: theme.label,
		members: theme.members
	}));
}

/** Verified contradiction pairs, shaped for the assistant tool result. */
export async function contradictionsFor(limit: number): Promise<{ label: string; members: { entityKind: 'note' | 'task'; entityId: string; score: number }[] }[]> {
	await findContradictions(limit);
	const rows = (await suggestionsRepo.listPending()).filter((row) => row.kind === 'contradicts');
	return rows.map((row) => ({
		label: row.reason,
		members: [
			{ entityKind: row.sourceKind, entityId: row.sourceId, score: row.score },
			{ entityKind: row.targetKind, entityId: row.targetId, score: row.score }
		]
	}));
}

export { refKey };
// --- clustering (#D9) -------------------------------------------------------

/**
 * Recomputes theme clusters from the current vectors and stores the pass.
 *
 * Deterministic: the same vectors produce the same clusters, so the graph's
 * colours do not shuffle between runs. Empty when memory is off.
 */
export async function buildClusters(): Promise<boolean> {
	if (!browser || !memoryReady()) return false;
	if (currentWindowRole() !== 'workspace' && isTauri) return false;
	try {
		const [notes, tasks] = await Promise.all([listAllNotes(), listAllTasks()]);
		const textByKey = new Map<string, string>();
		for (const note of notes) textByKey.set(`note:${note.id}`, `${note.title}\n${note.body}`);
		for (const task of tasks) textByKey.set(`task:${task.id}`, `${task.title}\n${task.notes}`);

		const items: ClusterItem[] = (await loadedVectors()).map((vector) => ({
			entityKind: vector.entityKind,
			entityId: vector.entityId,
			vec: vector.vec,
			text: textByKey.get(`${vector.entityKind}:${vector.entityId}`) ?? ''
		}));

		const clusters = clusterVectors(items, memoryStore.clusterCount);
		const runId = `run_${Date.now().toString(36)}`;
		const stored = clusters.map((cluster) => ({
			clusterId: cluster.id,
			label: cluster.label,
			members: cluster.members
		}));
		const ok = await clustersRepo.replaceRun(runId, stored);
		if (ok) await refreshThemes();
		return ok;
	} catch (error) {
		memoryStore.lastError = `Themes failed: ${message(error)}`;
		return false;
	}
}

/** A one-line message from an unknown thrown value. */
function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Reloads the current clusters into the reactive store. */
export async function refreshThemes(): Promise<void> {
	if (!browser) return;
	memoryStore.themes = await clustersRepo.list();
}
// --- contradictions (#D10) --------------------------------------------------

/**
 * Finds contradictions among the most similar note pairs.
 *
 * Stage one is vector similarity (`candidatePairs`), stage two is a model
 * verdict per pair. Requires an AI provider: without one this returns an empty
 * list and the UI hides the action (#D17). Verified pairs become `contradicts`
 * suggestions — never real edges (#D7).
 */
export async function findContradictions(limit = 10): Promise<boolean> {
	if (!browser) return false;
	if (!memoryReady()) {
		memoryStore.lastError = 'Build the index first, then check for contradictions.';
		return false;
	}
	if (currentWindowRole() !== 'workspace' && isTauri) return false;
	try {
		const { aiReady } = await import('$lib/stores/ai-settings.svelte');
		if (!aiReady()) {
			// Verifying a contradiction needs a model; without one the button must
			// explain itself instead of appearing to do nothing (#D17).
			memoryStore.lastError =
				'Checking contradictions needs an AI provider. Configure one in Settings → AI.';
			return false;
		}
		const { streamCompletion } = await import('$lib/stores/ai.svelte');

		const [notes, tasks] = await Promise.all([listAllNotes(), listAllTasks()]);
		const byKey = new Map<string, { title: string; text: string }>();
		for (const note of notes) byKey.set(`note:${note.id}`, { title: note.title, text: `${note.title}\n${note.body}` });
		for (const task of tasks) byKey.set(`task:${task.id}`, { title: task.title, text: `${task.title}\n${task.notes}` });

		const items: ContradictionItem[] = (await loadedVectors()).map((vector) => {
			const meta = byKey.get(`${vector.entityKind}:${vector.entityId}`);
			return {
				entityKind: vector.entityKind,
				entityId: vector.entityId,
				title: meta?.title ?? vector.entityId,
				text: meta?.text ?? '',
				vec: vector.vec
			};
		});

		const candidates = candidatePairs(items, {
			minScore: Math.max(0.4, memoryStore.threshold - 0.15),
			limit
		});
		if (candidates.length === 0) return true;

		const results: { pair: (typeof candidates)[number]; raw: string }[] = [];
		for (const pair of candidates) {
			try {
				const raw = await streamCompletion({
					messages: [{ role: 'user', content: verificationPrompt(pair) }],
					task: 'custom',
					maxTokensOverride: 96
				});
				results.push({ pair, raw });
			} catch {
				// A failed verification is not a contradiction; skip it.
			}
		}

		const found = verifiedContradictions(results);
		if (found.length === 0) {
			memoryStore.lastError = `Checked ${candidates.length} similar pair(s); no contradictions found.`;
			return true;
		}
		const created = found.map((item) => ({
			id: suggestionId(),
			sourceKind: item.source.entityKind,
			sourceId: item.source.entityId,
			targetKind: item.target.entityKind,
			targetId: item.target.entityId,
			edgeKind: 'contradicts' as const,
			score: item.score,
			reason: contradictionReason(item.reason)
		}));
		const ok = await suggestionsRepo.insertMany(created);
		if (ok) {
			memoryStore.lastError = null;
			await refreshSuggestions();
		}
		return ok;
	} catch (error) {
		memoryStore.lastError = `Contradiction check failed: ${message(error)}`;
		return false;
	}
}