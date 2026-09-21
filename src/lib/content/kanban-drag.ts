import { pointerReorder } from '$lib/content/pointer-reorder';
import type { TaskStatus } from '$lib/stores/tasks';

export type KanbanDragHandlers = {
	/** Drag threshold crossed: `id` is the task being dragged. */
	onStart: (id: string) => void;
	/** Pointer moved: `status` is the column under the pointer, if any. */
	onOver: (status: TaskStatus | null) => void;
	/** Pointer released: `beforeId` is the task under the pointer, if any. */
	onDrop: (id: string, status: TaskStatus | null, beforeId: string | null) => void;
};

function statusAt(x: number, y: number): TaskStatus | null {
	const el = document.elementFromPoint(x, y);
	return (el?.closest<HTMLElement>('[data-task-status]')?.dataset.taskStatus ??
		null) as TaskStatus | null;
}

function taskAt(x: number, y: number): string | null {
	const el = document.elementFromPoint(x, y);
	return el?.closest<HTMLElement>('[data-task-id]')?.dataset.taskId ?? null;
}

/**
 * Svelte action: pointer-based task reordering across `[data-task-status]`
 * columns. Cards must expose their id via `data-task-id` and their drag handle
 * via `data-task-handle`.
 */
export function kanbanDrag(node: HTMLElement, handlers: KanbanDragHandlers) {
	let current = handlers;
	let dragged: string | null = null;
	const reorder = pointerReorder(node, {
		handleSelector: '[data-task-handle]',
		idAttribute: 'data-task-id',
		onStart: (id) => {
			dragged = id;
			current.onStart(id);
		},
		onMove: (_id, event) => current.onOver(statusAt(event.clientX, event.clientY)),
		onEnd: (_id, event) => {
			const id = dragged;
			dragged = null;
			if (!id) return;
			current.onDrop(id, statusAt(event.clientX, event.clientY), taskAt(event.clientX, event.clientY));
		},
	});

	return {
		update(next: KanbanDragHandlers) {
			current = next;
		},
		destroy: () => reorder.destroy(),
	};
}
