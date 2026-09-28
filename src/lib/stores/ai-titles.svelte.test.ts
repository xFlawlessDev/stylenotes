import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
	loadSettings: vi.fn(),
	loadKey: vi.fn(),
	saveSettings: vi.fn(),
	listThreads: vi.fn(),
	createThread: vi.fn(),
	renameThread: vi.fn(),
	deleteThread: vi.fn(),
	listMessages: vi.fn(),
	addMessage: vi.fn(),
	clearHistory: vi.fn()
}));

vi.mock('$lib/db/ai', () => ({ aiRepo: repo }));
vi.mock('$lib/windows', () => ({ isTauri: true }));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('@tauri-apps/api/event', () => ({
	emit: vi.fn(async () => undefined),
	listen: vi.fn(async () => () => {})
}));

/**
 * Drives the real `streamCompletion` through the IPC seam: the mocked `invoke`
 * pushes a delta and a terminal `done` at the channel, which is exactly what
 * the Rust command would do.
 */
type FakeChannel = { onmessage: ((event: Record<string, unknown>) => void) | null };
const invoke = vi.hoisted(() => vi.fn());
const reply = vi.hoisted(() => ({ value: '' }));

vi.mock('@tauri-apps/api/core', () => ({
	invoke,
	Channel: class {
		onmessage: FakeChannel['onmessage'] = null;
	}
}));

invoke.mockImplementation(async (command: string, args: { onEvent?: FakeChannel }) => {
	if (command === 'ai_decrypt_key') return 'sk-test';
	if (command === 'ai_stream') {
		const channel = args.onEvent;
		if (reply.value) channel?.onmessage?.({ kind: 'delta', text: reply.value });
		channel?.onmessage?.({ kind: 'done', finishReason: 'stop' });
		return undefined;
	}
	return undefined;
});

import {
	aiStore,
	clearThreadAutoTitle,
	createThread,
	generateThreadTitle,
	markThreadAutoTitle,
	renameThread
} from '$lib/stores/ai.svelte';

const settings = {
	enabled: true,
	provider: 'openai-compatible' as const,
	baseUrl: '',
	model: 'gpt-4o-mini',
	temperature: 0.7,
	maxTokens: 1024,
	hasKey: true,
	access: 'read' as const,
	scopes: [],
	updatedAt: ''
};

const thread = (id: string, title: string) => ({
	id,
	title,
	noteId: null,
	createdAt: 'now',
	updatedAt: 'now'
});

const message = (id: number, role: 'user' | 'assistant', content: string) => ({
	id,
	threadId: 't1',
	role,
	content,
	createdAt: 'now'
});

/** Lets the fire-and-forget title promise chain settle. */
async function settle() {
	for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

beforeEach(() => {
	vi.clearAllMocks();
	reply.value = '';
	repo.loadSettings.mockResolvedValue(settings);
	repo.loadKey.mockResolvedValue('enc:v1:key');
	repo.listThreads.mockResolvedValue([thread('t1', 'stub')]);
	repo.createThread.mockResolvedValue(true);
	repo.renameThread.mockResolvedValue(true);
	repo.addMessage.mockResolvedValue(message(1, 'user', 'hi'));
	Object.assign(aiStore, {
		settings: { ...settings },
		threads: [thread('t1', 'stub')],
		messages: [],
		activeThreadId: null,
		streaming: false,
		error: null,
		hydrated: true
	});
});

describe('createThread', () => {
	it('marks a generically named thread as auto-titleable', async () => {
		const id = await createThread('New chat');
		expect(id).toBeTruthy();

		aiStore.messages = [message(1, 'user', 'hello'), message(2, 'assistant', 'hi')];
		reply.value = 'Greeting Exchange';
		generateThreadTitle(id!);
		await settle();

		expect(repo.renameThread).toHaveBeenCalledWith(id, 'Greeting Exchange');
	});

	it('does not auto-title a thread named from a note', async () => {
		const id = await createThread('Chat: Roadmap');
		aiStore.messages = [message(1, 'user', 'hello'), message(2, 'assistant', 'hi')];
		reply.value = 'Something';
		generateThreadTitle(id!);
		await settle();
		expect(repo.renameThread).not.toHaveBeenCalled();
	});
});

describe('generateThreadTitle', () => {
	it('does nothing without a full opening exchange', async () => {
		markThreadAutoTitle('t1');
		aiStore.messages = [message(1, 'user', 'only a question')];
		generateThreadTitle('t1');
		await settle();
		expect(repo.renameThread).not.toHaveBeenCalled();
	});

	it('does nothing for a thread that is not auto-titled', async () => {
		clearThreadAutoTitle('t1');
		aiStore.messages = [message(1, 'user', 'q'), message(2, 'assistant', 'a')];
		generateThreadTitle('t1');
		await settle();
		expect(repo.renameThread).not.toHaveBeenCalled();
	});

	it('sanitizes the model output before renaming', async () => {
		markThreadAutoTitle('t1');
		aiStore.messages = [message(1, 'user', 'q'), message(2, 'assistant', 'a')];
		reply.value = '"Weekly Review."';
		generateThreadTitle('t1');
		await settle();
		expect(repo.renameThread).toHaveBeenCalledWith('t1', 'Weekly Review');
	});

	it('keeps the fallback when the model returns nothing usable', async () => {
		markThreadAutoTitle('t1');
		aiStore.messages = [message(1, 'user', 'q'), message(2, 'assistant', 'a')];
		reply.value = '   ';
		generateThreadTitle('t1');
		await settle();
		expect(repo.renameThread).not.toHaveBeenCalled();
	});

	it('does not rename twice for concurrent calls', async () => {
		markThreadAutoTitle('t1');
		aiStore.messages = [message(1, 'user', 'q'), message(2, 'assistant', 'a')];
		reply.value = 'Title';
		generateThreadTitle('t1');
		generateThreadTitle('t1');
		await settle();
		const streamCalls = invoke.mock.calls.filter(([command]) => command === 'ai_stream');
		expect(streamCalls).toHaveLength(1);
	});
});

describe('renameThread', () => {
	it('stops a background title from overwriting a manual rename', async () => {
		markThreadAutoTitle('t1');
		await renameThread('t1', 'My title');

		aiStore.messages = [message(1, 'user', 'q'), message(2, 'assistant', 'a')];
		reply.value = 'Generated';
		generateThreadTitle('t1');
		await settle();
		expect(repo.renameThread).toHaveBeenCalledTimes(1);
		expect(repo.renameThread).toHaveBeenCalledWith('t1', 'My title');
	});
});
