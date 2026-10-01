import { metaRepo } from '$lib/db/meta';
import { MEMORY_META_KEYS } from '$lib/content/memory-types';
import type { AppNotification } from '$lib/stores/notifications';

/**
 * The notification raised the first time a semantic tool fails for want of an
 * embedder, and the flag that keeps it to one raise.
 *
 * Stored text is English on purpose: a row in SQLite is written once and read
 * by every language thereafter, so `seedNotificationText` renders it from the
 * catalog instead — the same arrangement as the four seed rows. The chat also
 * shows a banner; this is the copy that outlives the turn that discovered it.
 */
export function memoryNudgeNotification(): AppNotification {
	return {
		id: 'n-memory',
		kind: 'tip',
		title: 'Semantic memory is off',
		body: 'Open Settings → Memory and choose an embedder so the assistant can search your notes by meaning.',
		time: 'Just now',
		read: false
	};
}

/**
 * Raises the nudge at most once, ever, through `raise` — the workspace owns
 * the list (`workspace-notification-ops`), this decides *when*. Resolves to
 * whether it fired.
 *
 * The guard is a `meta` key rather than the list itself: the list can be
 * cleared at any moment, and re-raising a dismissed hint is precisely the
 * noise this exists to avoid. A failed read or write stays silent rather than
 * turning a hint into an error.
 */
export async function raiseMemoryNudgeOnce(
	raise: (notification: AppNotification) => void
): Promise<boolean> {
	try {
		if (await metaRepo.get(MEMORY_META_KEYS.nudge)) return false;
		await metaRepo.set(MEMORY_META_KEYS.nudge, '1');
	} catch {
		return false;
	}
	raise(memoryNudgeNotification());
	return true;
}
