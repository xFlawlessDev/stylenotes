/** Dock overlay dan tangkapan cepat. */
import type { OverlayMessages } from './messages';

export const over: OverlayMessages = {
	empty: 'Dock kosong',
	noMatch: 'Tidak ada item yang cocok dengan filter dock',
	noMatchTitle: 'Tidak ada item dock yang cocok dengan filter dock',
	quickCapture: 'Tangkapan cepat: catatan atau tugas baru',
	expand: 'Perluas dock',
	handle: 'Klik untuk perkecil · seret untuk pindah',
	dockTitle: 'Tangkapan cepat',
	newNote: 'Catatan baru',
	newTask: 'Tugas baru',
	openNote: '{title} — klik dua kali untuk membuka jendela catatan',
	openTask: '{title} — klik dua kali untuk membuka jendela tugas',
	taskCard: {
		removeFromDock: 'Hapus dari dock',
		addToDock: 'Tambah ke dock',
		moveToTodo: 'Kembalikan ke Akan dikerjakan',
		moveToProgress: 'Pindah ke Sedang dikerjakan',
		reopen: 'Buka kembali tugas',
		complete: 'Selesaikan tugas',
		edit: 'Edit tugas',
	},
	noteCard: { removeFromDock: 'Hapus dari dock', edit: 'Edit catatan' },
};
