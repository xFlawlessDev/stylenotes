/** Title bar, workspaces dan panel notifikasi. */
import type { ShellMessages } from './messages';

export const shell: ShellMessages = {
	brand: 'StyleNotes',
	window: { hideToTray: 'Sembunyikan ke tray', minimize: 'Minimalkan', maximize: 'Maksimalkan' },
	section: { notes: 'Catatan', tasks: 'Tugas', graph: 'Grafik' },
	sectionLabel: 'Bagian ruang kerja',
	commandPalette: 'Buka palet perintah',
	searchPlaceholder: 'Cari catatan dan aksi',
	toggleAssistant: 'Alihkan asisten AI',
	toggleDock: 'Alihkan dock',
	toggleTheme: 'Alihkan terang dan gelap',
	openFolders: 'Buka folder',
	openNotesList: 'Buka daftar catatan',
	settings: 'Pengaturan',
	notifications: 'Notifikasi',
	workspace: {
		label: 'Ruang kerja',
		manage: 'Kelola ruang kerja…',
		manageTitle: 'Kelola ruang kerja',
		manageDescription:
			'Ruang kerja memisahkan catatan dan tugas per konteks. Menghapusnya akan menghapus semua isinya.',
		newPlaceholder: 'Nama ruang kerja baru',
		newLabel: 'Nama ruang kerja baru',
		add: 'Tambah',
		nameLabel: 'Nama ruang kerja',
		saveName: 'Simpan nama ruang kerja',
		cancelRename: 'Batal ganti nama',
		active: 'Ruang kerja aktif',
		member: 'Ruang kerja',
		rename: 'Ganti nama {name}',
		delete: 'Hapus {name}',
		deleteQuestion: 'Hapus “{name}” dan semua isinya?',
		unsavedWarning:
			'Workspace ini punya perubahan yang belum tersimpan. Menghapusnya sekarang akan membuang perubahan itu.',
		unsavedNotes: 'Catatan: {titles}',
		unsavedTasks: 'Tugas: {titles}',
		close: 'Tutup',
		activeBadge: 'Ruang kerja: {name}',
		foreignBadge: 'Ruang kerja: {name} (bukan ruang kerja yang diikuti jendela ini)',
		error: {
			nameRequired: 'Beri nama ruang kerja.',
			nameTaken: 'Ruang kerja dengan nama itu sudah ada.',
			create: 'Tidak dapat membuat ruang kerja.',
			rename: 'Tidak dapat mengganti nama ruang kerja.',
			delete: 'Tidak dapat menghapus ruang kerja.',
		},
	},
	notification: {
		panelTitle: 'Notifikasi',
		newCount: '{count} baru',
		markAllRead: 'Tandai semua dibaca',
		allCaughtUp: 'Semua sudah dibaca.',
		clearAll: 'Bersihkan semua',
		savedLocally: 'Tersimpan lokal',
		closeNotifications: 'Tutup notifikasi',
		/** Menandai baris terhitung: mencerminkan state langsung, bukan event tersimpan. */
		live: 'Langsung',
		/** Menandai baris event tersimpan di bawah baris terhitung. */
		recent: 'Terbaru',
		/**
		 * Dihitung dari state aplikasi langsung, tidak pernah disimpan; lihat
		 * `content/notification-insights.ts`.
		 */
		insight: {
			tasks: {
				title: 'Ringkasan tugas harian',
				body: '{overdue} terlambat · {today} jatuh tempo hari ini · {blocked} terblokir',
			},
			indexing: {
				title: 'Mengindeks catatanmu',
				progress: '{done} dari {total} item sudah diindeks.',
				working: 'Membangun indeks pencarian. Ini butuh beberapa saat.',
				behindTitle: 'Indeks pencarian tertinggal',
				behindBody: '{count} item menunggu untuk diindeks.',
			},
			vault: {
				title: 'Vault perlu keputusan',
				body: '{count} file berubah di kedua sisi.',
			},
			suggestions: {
				title: 'Saran tautan baru',
				body: '{count} catatan tampak berkaitan. Tinjau di grafik.',
			},
			attachments: {
				title: 'Lampiran tak terpakai',
				body: '{count} file tersimpan tidak lagi dirujuk catatan mana pun.',
			},
			journal: {
				title: 'Jurnal belum dimulai',
				body: 'Catatan hari ini belum ditulis.',
			},
		},
		/** Dibangkitkan oleh aplikasi; lihat `stores/memory-nudge.ts`. */
		memory: {
			title: 'Memori semantik nonaktif',
			body: 'Buka Pengaturan → Memori dan pilih embedder agar asisten bisa mencari catatanmu berdasarkan makna.',
			time: 'Baru saja',
		},
		/** Dibangkitkan oleh pemeriksaan pembaruan latar; lihat `stores/update.svelte.ts`. */
		update: {
			title: 'Versi {version} tersedia',
			body: 'Versi StyleNotes baru sudah siap. Buka Pengaturan → Tentang untuk memasangnya.',
			time: 'Baru saja',
		},
	},
};
