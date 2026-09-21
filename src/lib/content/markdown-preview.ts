const FENCE = /^\s*(```|~~~)/;
const INDENTED = /^(\t| {4})/;

export function preserveBlankLines(source: string): string {
	const lines = source.split('\n');
	const out: string[] = [];
	let inFence = false;
	let blankRun = 0;
	let lastContent = '';

	const flush = (expand: boolean) => {
		if (blankRun === 0) return;
		if (!expand) {
			for (let i = 0; i < blankRun; i += 1) out.push('');
		} else {
			out.push('');
			for (let i = 1; i < blankRun; i += 1) {
				out.push('<br>');
				out.push('');
			}
		}
		blankRun = 0;
	};

	for (const line of lines) {
		if (FENCE.test(line)) {
			flush(!inFence);
			inFence = !inFence;
			out.push(line);
			lastContent = line;
			continue;
		}
		if (!inFence && line.trim() === '') {
			blankRun += 1;
			continue;
		}
		flush(!inFence && !INDENTED.test(lastContent) && !INDENTED.test(line));
		out.push(line);
		lastContent = line;
	}
	flush(!inFence && !INDENTED.test(lastContent));

	return out.join('\n');
}

export function enableTaskCheckboxes(markup: string): string {
	return markup.replace(/<input\b[^>]*>/g, (tag) =>
		tag.includes('type="checkbox"') ? tag.replace(/\s+disabled(?:="[^"]*")?/, '') : tag
	);
}

export function clickedCheckboxIndex(root: HTMLElement, target: EventTarget | null): number {
	if (!(target instanceof HTMLElement)) return -1;
	const input = target.closest('input[type="checkbox"]');
	if (!(input instanceof HTMLInputElement) || !root.contains(input)) return -1;
	const boxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
	return boxes.indexOf(input);
}
