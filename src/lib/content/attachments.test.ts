import { describe, it, expect } from 'vitest';
import {
	attachmentKind,
	attachmentLinkTarget,
	attachmentMarkdown,
	attachmentObjectPath,
	attachmentReference,
	fileExtension,
	fileNameFromPath,
	fileLinkKind,
	insertAttachment,
	isAttachmentReference,
	isEmbeddablePath,
	isImagePath,
	isVideoPath,
	joinAttachmentMarkdown,
	localFilePath,
	normalizeExtension,
	parseAttachmentReference,
	repairLocalImageLinks,
	resolveAttachmentSources,
	resolveLocalImages,
	rewriteAttachmentReferences,
	targetExtension,
} from '$lib/content/attachments';
import {
	attachmentReferencesChanged,
	extractReferences,
	missingReferences,
	referencedIds,
} from '$lib/content/attachment-manager';

const HASH = 'a'.repeat(64);

describe('fileNameFromPath', () => {
	it('handles windows and posix separators', () => {
		expect(fileNameFromPath('C:\\Users\\a\\photo.png')).toBe('photo.png');
		expect(fileNameFromPath('/home/a/report.pdf')).toBe('report.pdf');
	});
});

describe('fileExtension', () => {
	it('lowercases the extension', () => {
		expect(fileExtension('C:/tmp/Photo.PNG')).toBe('png');
	});

	it('returns empty for dotfiles and extensionless names', () => {
		expect(fileExtension('/tmp/.gitignore')).toBe('');
		expect(fileExtension('/tmp/README')).toBe('');
	});
});

describe('isImagePath', () => {
	it('detects common image formats', () => {
		expect(isImagePath('/tmp/a.jpeg')).toBe(true);
		expect(isImagePath('/tmp/a.svg')).toBe(true);
	});

	it('rejects non-images', () => {
		expect(isImagePath('/tmp/a.pdf')).toBe(false);
		expect(isImagePath('/tmp/a.zip')).toBe(false);
	});
});

describe('attachmentMarkdown', () => {
	it('embeds images with a normalized path', () => {
		expect(attachmentMarkdown('C:\\pics\\cat.png')).toBe('![cat.png](C:/pics/cat.png)');
	});

	it('links other files', () => {
		expect(attachmentMarkdown('/docs/plan.pdf')).toBe('[plan.pdf](/docs/plan.pdf)');
	});

	it('wraps paths with spaces or parentheses in angle brackets', () => {
		expect(attachmentMarkdown('C:\\My Pics\\cat (1).png')).toBe(
			'![cat (1).png](<C:/My Pics/cat (1).png>)'
		);
	});
});

describe('localFilePath', () => {
	it('detects windows drive and UNC paths', () => {
		expect(localFilePath('C:\\pics\\cat.png')).toBe('C:\\pics\\cat.png');
		expect(localFilePath('C:/pics/cat.png')).toBe('C:/pics/cat.png');
		expect(localFilePath('\\\\server\\share\\cat.png')).toBe('\\\\server\\share\\cat.png');
	});

	it('detects posix absolute and file urls', () => {
		expect(localFilePath('/home/a/cat.png')).toBe('/home/a/cat.png');
		expect(localFilePath('file:///C:/pics/cat.png')).toBe('C:/pics/cat.png');
		expect(localFilePath('file:///home/a/cat.png')).toBe('/home/a/cat.png');
	});

	it('decodes percent-encoded paths produced by markdown parsers', () => {
		expect(localFilePath('C:/My%20Pics/cat.png')).toBe('C:/My Pics/cat.png');
		expect(localFilePath('/home/a/my%20cat.png')).toBe('/home/a/my cat.png');
	});

	it('ignores web, data and relative paths', () => {
		expect(localFilePath('https://x.test/a.png')).toBeNull();
		expect(localFilePath('data:image/png;base64,AAAA')).toBeNull();
		expect(localFilePath('images/a.png')).toBeNull();
		expect(localFilePath('')).toBeNull();
	});
});

describe('repairLocalImageLinks', () => {
	it('wraps local destinations that contain whitespace', () => {
		expect(repairLocalImageLinks('![x](C:/My Pics/a.png)')).toBe('![x](<C:/My Pics/a.png>)');
		expect(repairLocalImageLinks('![x](/home/a b/c.png)')).toBe('![x](</home/a b/c.png>)');
	});

	it('leaves valid, remote and titled links untouched', () => {
		const markdown = '![x](C:/a.png) ![y](https://x.test/a b.png) ![z](C:/a.png (title))';
		expect(repairLocalImageLinks(markdown)).toBe(markdown);
	});
});

describe('resolveLocalImages', () => {
	const resolve = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;

	it('rewrites local image sources through the resolver', () => {
		const html = resolveLocalImages('<p><img src="C:/pics/cat.png" alt="cat"></p>', resolve);
		expect(html).toContain('src="asset://localhost/C%3A%2Fpics%2Fcat.png"');
		expect(html).toContain('alt="cat"');
	});

	it('leaves remote and data sources untouched', () => {
		const html = '<img src="https://x.test/a.png"><img src="data:image/png;base64,AAAA">';
		expect(resolveLocalImages(html, resolve)).toBe(html);
	});

	it('keeps the original html when the resolver declines', () => {
		const html = '<img src="C:/pics/cat.png">';
		expect(resolveLocalImages(html, () => null)).toBe(html);
	});
});

describe('joinAttachmentMarkdown', () => {
	it('joins multiple attachments on separate lines', () => {
		expect(joinAttachmentMarkdown(['/a/one.png', '/a/two.txt'])).toBe(
			'![one.png](/a/one.png)\n[two.txt](/a/two.txt)'
		);
	});
});

describe('insertAttachment', () => {
	it('inserts a block and moves the caret after it', () => {
		const result = insertAttachment('hello', 5, 5, '[a.txt](/a.txt)');
		expect(result.value).toBe('hello\n[a.txt](/a.txt)');
		expect(result.start).toBe(result.value.length);
	});

	it('wraps around a selection with trailing newline', () => {
		const result = insertAttachment('a\nb', 2, 3, '![x](/x.png)');
		expect(result.value).toBe('a\n![x](/x.png)\nb');
	});

	it('adds no breaks when the body is empty', () => {
		const result = insertAttachment('', 0, 0, '[a.txt](/a.txt)');
		expect(result.value).toBe('[a.txt](/a.txt)');
	});
});

describe('normalizeExtension', () => {
	it('lowercases and strips a leading dot', () => {
		expect(normalizeExtension('.PNG')).toBe('png');
		expect(normalizeExtension('Jpeg')).toBe('jpeg');
	});

	it('rejects anything that is not a short alphanumeric token', () => {
		expect(normalizeExtension('')).toBe('');
		expect(normalizeExtension('tar.gz')).toBe('');
		expect(normalizeExtension('a b')).toBe('');
		expect(normalizeExtension('toolongextensionname')).toBe('');
	});
});

describe('attachment references', () => {
	it('builds a reference with and without an extension', () => {
		expect(attachmentReference(HASH, 'png')).toBe(`stylenotes-attachment://${HASH}.png`);
		expect(attachmentReference(HASH, '')).toBe(`stylenotes-attachment://${HASH}`);
	});

	it('round-trips through parse', () => {
		expect(parseAttachmentReference(`stylenotes-attachment://${HASH}.pdf`)).toEqual({
			id: HASH,
			ext: 'pdf',
		});
		expect(parseAttachmentReference(`stylenotes-attachment://${HASH}`)).toEqual({ id: HASH, ext: '' });
	});

	it('rejects foreign and malformed urls', () => {
		expect(parseAttachmentReference('https://x.test/a.png')).toBeNull();
		expect(parseAttachmentReference('asset://localhost/a.png')).toBeNull();
		expect(parseAttachmentReference('stylenotes-attachment://')).toBeNull();
		expect(parseAttachmentReference('stylenotes-attachment://nothex!.png')).toBeNull();
		expect(isAttachmentReference(`stylenotes-attachment://${HASH}.png`)).toBe(true);
	});
});

describe('attachmentKind', () => {
	it('classifies by extension', () => {
		expect(attachmentKind('cat.png')).toBe('image');
		expect(attachmentKind('clip.mp4')).toBe('video');
		expect(attachmentKind('song.flac')).toBe('audio');
		expect(attachmentKind('paper.pdf')).toBe('pdf');
		expect(attachmentKind('notes.txt')).toBe('file');
	});

	it('accepts a bare extension and a store reference', () => {
		expect(attachmentKind('png')).toBe('image');
		expect(attachmentKind(`stylenotes-attachment://${HASH}.mp4`)).toBe('video');
	});

	it('exposes embeddable and media predicates', () => {
		expect(isEmbeddablePath('a.png')).toBe(true);
		expect(isEmbeddablePath('a.mp4')).toBe(true);
		expect(isEmbeddablePath('a.pdf')).toBe(false);
		expect(isVideoPath('a.webm')).toBe(true);
		expect(isImagePath('a.pdf')).toBe(false);
	});
});

describe('attachmentObjectPath', () => {
	it('shards by hash prefix and mirrors the Rust layout', () => {
		expect(attachmentObjectPath('ab12cd', 'png')).toBe('attachments/ab/ab12cd.png');
		expect(attachmentObjectPath('ab12cd', '')).toBe('attachments/ab/ab12cd');
	});

	it('agrees with targetExtension for a reference', () => {
		expect(targetExtension(`stylenotes-attachment://${HASH}.webp`)).toBe('webp');
		expect(targetExtension('C:/pics/cat.PNG')).toBe('png');
	});
});

describe('attachmentMarkdown for store references', () => {
	it('embeds media and links documents, keeping the label', () => {
		expect(attachmentMarkdown(`stylenotes-attachment://${HASH}.png`, 'shot.png')).toBe(
			`![shot.png](stylenotes-attachment://${HASH}.png)`
		);
		expect(attachmentMarkdown(`stylenotes-attachment://${HASH}.pdf`, 'plan.pdf')).toBe(
			`[plan.pdf](stylenotes-attachment://${HASH}.pdf)`
		);
	});

	it('falls back to a display name when no label is given', () => {
		expect(attachmentMarkdown(`stylenotes-attachment://${HASH}.png`)).toBe(
			`![attachment.png](stylenotes-attachment://${HASH}.png)`
		);
	});
});

describe('rewriteAttachmentReferences', () => {
	it('turns references into store-relative paths for export', () => {
		const body = `Here: ![x](stylenotes-attachment://${HASH}.png) and [d](stylenotes-attachment://${HASH}.pdf).`;
		expect(rewriteAttachmentReferences(body)).toBe(
			`Here: ![x](attachments/aa/${HASH}.png) and [d](attachments/aa/${HASH}.pdf).`
		);
	});

	it('leaves ordinary links and text untouched', () => {
		const body = '[x](https://x.test/a.png) [[Wiki]] plain text';
		expect(rewriteAttachmentReferences(body)).toBe(body);
	});
});

describe('resolveAttachmentSources', () => {
	// Mirrors the real resolver: only attachment targets are rewritten.
	const resolve = (target: string) =>
		isAttachmentReference(target)
			? `asset://localhost/${encodeURIComponent(target)}`
			: null;

	it('rewrites image, video, audio and source elements', () => {
		const html =
			`<p><img src="stylenotes-attachment://${HASH}.png">` +
			`<video src="stylenotes-attachment://${HASH}.mp4"></video>` +
			`<audio src="stylenotes-attachment://${HASH}.mp3"></audio>` +
			`<video><source src="stylenotes-attachment://${HASH}.webm"></video></p>`;
		const out = resolveAttachmentSources(html, resolve);
		expect(out).toContain(`asset://localhost/${encodeURIComponent(`stylenotes-attachment://${HASH}.png`)}`);
		expect(out).toContain(`asset://localhost/${encodeURIComponent(`stylenotes-attachment://${HASH}.mp4`)}`);
		expect(out).toContain(`asset://localhost/${encodeURIComponent(`stylenotes-attachment://${HASH}.mp3`)}`);
		expect(out).toContain(`asset://localhost/${encodeURIComponent(`stylenotes-attachment://${HASH}.webm`)}`);
	});

	it('leaves file links alone so a click opens them in the OS', () => {
		const html = `<a href="stylenotes-attachment://${HASH}.pdf">doc</a>`;
		expect(resolveAttachmentSources(html, resolve)).toBe(html);
	});

	it('returns the original html when nothing changed', () => {
		const html = '<img src="https://x.test/a.png"><img src="data:image/png;base64,AAAA">';
		expect(resolveAttachmentSources(html, resolve)).toBe(html);
	});
});

describe('fileLinkKind and attachmentLinkTarget', () => {
	function root(html: string): HTMLElement {
		const el = document.createElement('div');
		el.innerHTML = html;
		document.body.append(el);
		return el;
	}

	it('recognises stored and legacy document links', () => {
		expect(fileLinkKind(`stylenotes-attachment://${HASH}.pdf`)).toBe('pdf');
		expect(fileLinkKind('/docs/plan.pdf')).toBe('pdf');
		expect(fileLinkKind(`stylenotes-attachment://${HASH}.zip`)).toBe('file');
		expect(fileLinkKind('https://x.test/a.pdf')).toBeNull();
	});

	it('finds an attachment link target but ignores wiki and remote links', () => {
		const el = root(
			`<a href="stylenotes-attachment://${HASH}.pdf" id="doc">doc</a>` +
				'<a href="https://x.test/a.pdf" id="web">web</a>' +
				'<a href="#" data-wiki-target="n1" id="wiki">wiki</a>'
		);
		expect(attachmentLinkTarget(el.querySelector('#doc'), el)).toBe(
			`stylenotes-attachment://${HASH}.pdf`
		);
		expect(attachmentLinkTarget(el.querySelector('#web'), el)).toBeNull();
		expect(attachmentLinkTarget(el.querySelector('#wiki'), el)).toBeNull();
		el.remove();
	});
});

describe('extractReferences', () => {
	it('finds, dedupes and orders store references', () => {
		const body = `![a](stylenotes-attachment://${HASH}.png) [b](stylenotes-attachment://deadbeef.pdf) ![a](stylenotes-attachment://${HASH}.png)`;
		expect(extractReferences(body)).toEqual([
			`stylenotes-attachment://${HASH}.png`,
			'stylenotes-attachment://deadbeef.pdf'
		]);
	});

	it('stops at punctuation and ignores foreign urls', () => {
		expect(extractReferences(`x (stylenotes-attachment://${HASH}.png), y`)).toEqual([
			`stylenotes-attachment://${HASH}.png`
		]);
		expect(extractReferences('[a](https://x.test/a.png) plain')).toEqual([]);
	});

	it('collects the referenced ids across many bodies', () => {
		const ids = referencedIds([
			`![a](stylenotes-attachment://${HASH}.png)`,
			'[b](stylenotes-attachment://deadbeef.pdf)'
		]);
		expect(ids).toEqual(new Set([HASH, 'deadbeef']));
	});

	it('reports references whose blob is missing', () => {
		const body = `![a](stylenotes-attachment://${HASH}.png) [b](stylenotes-attachment://deadbeef.pdf)`;
		expect(missingReferences(body, new Set([HASH]))).toEqual(['stylenotes-attachment://deadbeef.pdf']);
	});
});

describe('attachmentReferencesChanged', () => {
	it('is true when a reference is added or removed', () => {
		const withImage = `![a](stylenotes-attachment://${HASH}.png)`;
		expect(attachmentReferencesChanged('text', withImage)).toBe(true);
		expect(attachmentReferencesChanged(withImage, 'text')).toBe(true);
	});

	it('is true when one reference replaces another', () => {
		expect(
			attachmentReferencesChanged(
				`![a](stylenotes-attachment://${HASH}.png)`,
				'![b](stylenotes-attachment://deadbeef.jpg)'
			)
		).toBe(true);
	});

	it('is false for ordinary text edits and reordering', () => {
		const body = `![a](stylenotes-attachment://${HASH}.png) and [b](stylenotes-attachment://deadbeef.pdf)`;
		expect(attachmentReferencesChanged(body, `${body} more text`)).toBe(false);
		const reversed = `[b](stylenotes-attachment://deadbeef.pdf) and ![a](stylenotes-attachment://${HASH}.png)`;
		expect(attachmentReferencesChanged(body, reversed)).toBe(false);
	});
});