import { buttonVariants } from '$lib/components/base';
import { isTauri } from '$lib/windows';

const actionButton = buttonVariants({ variant: 'ghost', size: 'xs' });

function createActionButton(action: string, label: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.dataset.previewAction = action;
	button.className = `preview-action ${actionButton}`;
	button.setAttribute('aria-label', label);
	button.textContent = label;
	return button;
}

function appendActionBar(container: HTMLElement, actions: [string, string][]) {
	const bar = document.createElement('div');
	bar.className = 'preview-action-bar';
	for (const [action, label] of actions) bar.append(createActionButton(action, label));
	container.append(bar);
}

export function addCodeCopyButtons(html: string): string {
	const template = document.createElement('template');
	template.innerHTML = html;
	for (const pre of template.content.querySelectorAll('pre')) {
		const code = pre.querySelector(':scope > code');
		if (!code || code.classList.contains('language-mermaid')) continue;
		appendActionBar(pre, [['copy-code', 'Copy code']]);
	}
	return template.innerHTML;
}

export function extractCodeText(code: HTMLElement): string {
	const lines = code.querySelectorAll('.line');
	if (!lines.length) return code.textContent ?? '';
	return Array.from(lines, (line) => line.textContent ?? '').join('\n');
}

export async function svgToPng(svgText: string): Promise<Blob> {
	const source = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
	try {
		const image = new Image();
		image.src = source;
		await image.decode();
		const width = image.naturalWidth;
		const height = image.naturalHeight;
		if (!width || !height) throw new Error('Diagram has no dimensions');

		const scale = 2;
		const canvas = document.createElement('canvas');
		canvas.width = width * scale;
		canvas.height = height * scale;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas is unavailable');
		context.scale(scale, scale);
		context.drawImage(image, 0, 0, width, height);

		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((result) => {
				if (result) resolve(result);
				else reject(new Error('Could not encode diagram'));
			}, 'image/png');
		});
		return blob;
	} finally {
		URL.revokeObjectURL(source);
	}
}

function browserDownload(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveDiagram(blob: Blob, filename: string, format: 'svg' | 'png'): Promise<boolean> {
	if (isTauri) {
		const [{ save }, { writeFile, writeTextFile }] = await Promise.all([
			import('@tauri-apps/plugin-dialog'),
			import('@tauri-apps/plugin-fs'),
		]);
		const path = await save({
			defaultPath: filename,
			filters: [{ name: format.toUpperCase(), extensions: [format] }],
		});
		if (!path) return false;
		if (format === 'svg') {
			await writeTextFile(path, await blob.text());
		} else {
			await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
		}
		return true;
	}

	browserDownload(blob, filename);
	return true;
}

function setActionFeedback(button: HTMLButtonElement, success: boolean) {
	const original = button.dataset.originalLabel ?? button.textContent ?? '';
	button.dataset.originalLabel = original;
	button.textContent = success ? 'Done' : 'Failed';
	button.disabled = true;
	setTimeout(() => {
		if (!button.isConnected) return;
		button.textContent = original;
		button.disabled = false;
	}, 1200);
}

export async function handlePreviewAction(event: MouseEvent, root: HTMLElement): Promise<boolean> {
	if (!(event.target instanceof Element)) return false;
	const button = event.target.closest<HTMLButtonElement>('[data-preview-action]');
	if (!button || !root.contains(button)) return false;
	event.preventDefault();
	event.stopPropagation();

	const action = button.dataset.previewAction;
	if (action === 'copy-code') {
		const code = button.closest('pre')?.querySelector('code');
		if (!code) {
			setActionFeedback(button, false);
			return true;
		}
		try {
			await navigator.clipboard.writeText(extractCodeText(code));
			setActionFeedback(button, true);
		} catch {
			setActionFeedback(button, false);
		}
		return true;
	}

	return false;
}
