/**
 * Indonesian markdown import strings. Typed against the English bundle.
 */
export const importMarkdown = {
	title: 'Impor Markdown',
	subtitle: 'Bawa vault Obsidian, sebuah folder, atau satu catatan ke ruang kerja ini.',
	close: 'Tutup impor',
	recursive: 'Sertakan subfolder',
	chooseFolder: 'Pilih folder',
	chooseFile: 'Pilih berkas',
	pickFolder: 'Pilih vault atau folder untuk diimpor',
	pickFile: 'Pilih berkas markdown',
	preview: '{notes} catatan · {links} tautan wiki · {tags} tag',
	conflicts: '{count} judul sudah ada',
	skipped: '{count} berkas dilewati',
	conflictPolicy: 'Saat judul sudah ada',
	policySkip: 'Pertahankan yang ada',
	policyDuplicate: 'Impor sebagai baru',
	cancel: 'Batal',
	confirm: 'Impor',
	error: { write: 'Tidak dapat menulis catatan hasil impor' },
} as const;
