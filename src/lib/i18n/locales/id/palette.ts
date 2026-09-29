/** Palet perintah. */
import type { PaletteMessages } from './messages';

export const palette: PaletteMessages = {
	placeholder: 'Cari catatan, tugas, folder, dan aksi',
	noResults: 'Tidak ada hasil untuk “{query}”.',
	groups: { notes: 'Catatan', tasks: 'Tugas', folders: 'Folder', actions: 'Aksi' },
	hint: { navigate: 'navigasi', open: 'buka', close: 'tutup' },
	closeLabel: 'Tutup palet perintah',
	action: {
		newNote: 'Catatan baru',
		newFolder: 'Folder baru',
		openTasks: 'Buka tugas',
		openGraph: 'Buka graf',
		toggleTheme: 'Alihkan terang dan gelap',
		openSettings: 'Buka pengaturan',
		export: 'Ekspor semua catatan',
	},
};
