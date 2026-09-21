import { describe, it, expect } from 'vitest';
import {
	attachmentMarkdown,
	fileExtension,
	fileNameFromPath,
	insertAttachment,
	isImagePath,
	joinAttachmentMarkdown,
	localFilePath,
	repairLocalImageLinks,
	resolveLocalImages,
} from '$lib/content/attachments';

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