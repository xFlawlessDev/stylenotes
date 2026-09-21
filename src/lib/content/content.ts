/// <reference types="vite/client" />

export type Note = {
  id: string;
  title: string;
  folder: string;
  tags: string[];
  updated: string;
  pinned: boolean;
  excerpt: string;
  body: string;
  words: number;
  chars: number;
};

export function countWords(body: string): number {
  const text = stripMarkdown(body);
  return text ? text.split(' ').length : 0;
}

export function buildExcerpt(body: string, limit = 150): string {
  const text = stripMarkdown(body);
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}...` : text;
}

export function createNote(seed: Partial<Note> = {}): Note {
  const body = seed.body ?? '';
  return {
    id: seed.id ?? crypto.randomUUID(),
    title: seed.title ?? 'Untitled note',
    folder: seed.folder ?? 'personal',
    tags: seed.tags ?? [],
    updated: seed.updated ?? 'Just now',
    pinned: seed.pinned ?? false,
    excerpt: seed.excerpt ?? buildExcerpt(body),
    body,
    words: seed.words ?? countWords(body),
    chars: seed.chars ?? body.length,
  };
}

type Frontmatter = Record<string, string | string[]>;

function parseFrontmatter(raw: string): { data: Frontmatter; body: string } {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw.trim() };

  const data: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (!key) continue;
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      data[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }
  return { data, body: raw.slice(match[0].length).trim() };
}

function asString(value: string | string[] | undefined, fallback = ''): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function asList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~>|#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function plainText(body: string): string {
  return stripMarkdown(body);
}

function buildNote(path: string, raw: string): Note {
  const { data, body } = parseFrontmatter(raw);
  const fileName = path.split('/').pop() ?? path;
  const id = fileName.replace(/\.md$/, '');

  return {
    id,
    title: asString(data.title, id),
    folder: asString(data.folder, 'personal'),
    tags: asList(data.tags),
    updated: asString(data.updated, 'Recently'),
    pinned: asString(data.pinned).toLowerCase() === 'true',
    excerpt: asString(data.excerpt) || buildExcerpt(body),
    body,
    words: countWords(body),
    chars: body.length,
  };
}

const modules = import.meta.glob('./notes/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const notes: Note[] = Object.entries(modules)
  .map(([path, raw]) => buildNote(path, raw))
  .sort((a, b) => Number(b.pinned) - Number(a.pinned));