/** Halaman grafik ruang kerja, kanvas, dan panel detail. */
import type { GraphMessages } from './messages';

export const graph: GraphMessages = {
	pageTitle: 'Grafik ruang kerja',
	pageStats: '{notes} catatan · {tasks} tugas · {links} tautan',
	highlightPlaceholder: 'Sorot simpul',
	highlightLabel: 'Sorot simpul grafik',
	emptyHeading: 'Belum ada yang bisa digambarkan',
	emptyTitle: 'Buat catatan atau tugas di ruang kerja ini untuk melihatnya di sini.',
	nodes: 'Simpul',
	links: 'Tautan',
	node: { note: 'Catatan', task: 'Tugas' },
	edge: { wiki: 'Tautan wiki', link: 'Catatan tertaut', dependency: 'Ketergantungan' },
	fitView: 'Sesuaikan tampilan',
	statusIdle: 'Arahkan ke simpul untuk memeriksa tautan · seret simpul untuk memindahkan · gulir untuk zoom',
	statusActive: '{kind} · {title} · {count} tautan',
	statusActivePlural: '{kind} · {title} · {count} tautan',
	drawer: {
		title: 'Detail simpul',
		close: 'Tutup detail',
		connections: 'Koneksi',
		connectionOne: '{count} koneksi',
		connectionMany: '{count} koneksi',
		isolated: 'Belum ada tautan — simpul ini terisolasi di grafik.',
		open: 'Buka {title}',
		openNote: 'Buka catatan',
		openTask: 'Buka tugas',
	},
	canvas: { ariaLabel: 'Kanvas grafik berarah-gaya' },
	failed: 'Tidak dapat merender grafik di perangkat ini.',
	layingOut: 'Menata grafik…',
};
