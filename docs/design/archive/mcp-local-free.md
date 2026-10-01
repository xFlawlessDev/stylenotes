# System Design — Local MCP Server (Free Tier) & Settings

> Status: **Design decided — 16 keputusan tercatat (#D1–#D16), 0 pertanyaan terbuka** (lihat §11 untuk riwayat 8 pertanyaan + jawabannya, §5a untuk full flow 7 use case).
> Tanggal: 2026-09-27
> Scope: **Local MCP (stdio) untuk user Free**, plus halaman Settings yang mengaturnya.
> Dokumen terkait:
> - the business model — **Local MCP = gratis (B5)**, remote MCP = Plus/Pro (§2). Dokumen bisnis adalah induk keputusan di sini.
> - the cloud sync design — §9 sudah menetapkan "remote-only dulu"; dokumen ini **membalik urutan itu untuk Free** (§1 alasan).
> - the collaboration design — tempat task/org/CRDT ke depan; memengaruhi scope write MCP (#D11).

---

## 0. Ringkasan eksekutif

User Free tidak punya akun, tidak punya sync, dan **tidak boleh dibebani biaya server apa pun**. Tapi mereka tetap ingin **kolaborasi dengan AI agent** milik mereka sendiri: memantau task, mengatur dependency, bertanya lintas note ("graph/context query"), dsb.

Jawabannya: **StyleNotes menjalankan MCP server lokal di dalam proses Tauri** (bukan server HTTP, bukan sidecar), dan **mengaturnya dari Settings**.

Prinsip pembentuk desain — semuanya konsekuensi dari arsitektur yang sudah ada:

1. **Tidak ada port, tidak ada listener, tidak ada auth.** Transport = **stdio**. Satu-satunya "izin" adalah **proses client berhasil mem-spawn biner `stylenotes-mcp`** (#D11). Tidak ada permukaan jaringan yang bisa dieksploitasi.
2. **Satu pintu tulis.** Semua agent berkomunikasi dengan **satu proses `stylenotes-mcp`**, bukan langsung ke SQLite. Proses itu **meneruskan operasi ke app yang sedang berjalan lewat file JSON di direktori app** (#D2), dan **app menjalankannya lewat store** (`persistTask`, `addDependency`, …) — bukan `INSERT` mentah. Konsekuensinya: **deteksi cycle dependency, validasi patch task, refresh lintas window, dan notifikasi yang sudah ada tetap berlaku** untuk semua tulisan agent.
3. **App berjalan = kondisi normal.** Windows StyleNotes tidak pernah benar-benar tertutup (hide-on-close + tray, `lib.rs`). Karena itu "app harus terbuka" **bukan** batasan yang terasa bagi user; proses `stylenotes-mcp` **tidak menyimpan fallback state ke disk** (#D5).
4. **Baca aman, tulis eksplisit.** Default **read-only**. Write dibuka oleh user lewat satu toggle di Settings, dengan scope per-kategori (notes / tasks / dependency) dan **konfirmasi** ("Izinkan & buka akses tulis" → dialog).

Hasil untuk user: pasang di `claude_desktop_config.json` / Cursor, lalu agent bisa menjawab **"apa yang menghambat task ini?"**, **"tandai tugas X selesai"**, **"note mana yang membahas Y?"** — tanpa akun dan tanpa internet.

---

## 1. Kondisi kode saat ini (temuan yang membentuk desain)

Dibaca dari `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src/lib/db/index.ts`, `src/lib/stores/*`, `src/lib/content/content.ts`, `src/lib/content/wiki-links.ts`, `src/lib/content/workspace-graph.ts`.

| # | Temuan | Implikasi ke desain |
|---|--------|---------------------|
| 1 | **Tidak ada path DB absolut di kode** — hanya `sqlite:stylenotes.db` (relatif, di `lib.rs` `DB_URL` + `tauri.conf.json` + `src/lib/db/index.ts` `DB_URL`). | Tidak ada yang menjamin di mana file DB berada di disk. **Blocker #Q1** — sebelum V1, tetapkan path (`app_data_dir`) sebagai sumber tunggal dan sinkronkan 3 tempat itu. Lihat §6. |
| 2 | **Semua tulis lewat store → repo.** `persistTask`, `persistTaskList`, `removeTask`, `addDependency`, `removeDependency`, `persistNote`, `updateSettings`; tiap store juga `emit(...-changed)`. | Menulis DB langsung dari MCP akan **melewati validasi** (`canAddDependency`, `applyTaskPatch`, `normalizeNoteIds`) dan **tidak me-refresh window lain**. Karena itu satu-satunya jalur tulis yang benar adalah **lewat app** (#D2). |
| 3 | **Multi-window menulis SQLite yang sama** (`workspace`, `overlay`, `kanban`, `note-*`, `task-*`). | Tulis MCP dari proses yang tidak menjaga guard in-memory (note window: `if (!queue.state.dirty)`, Workspace: `if (persistTimer) return`) berisiko **menimpa ketikan user yang belum ter-persist**. → aturan #D4. |
| 4 | **Windows tidak pernah benar-benar tutup.** `hide_on_close` hanya menyembunyikan `workspace`/`overlay`/`kanban`; user menutup app lewat tray. Detail window (`note-*`/`task-*`) **`destroy()` saat ditutup** (`TaskWindow.svelte:247`). | 3 hal: (a) workspace selalu hidup → "tulis lewat app" selalu tersedia; (b) **tidak boleh** menargetkan window `task-*` sebagai eksekutor; (c) "app sedang jalan" adalah asumsi yang aman (#D5). |
| 5 | **`notes.updated` adalah string display** (`"Just now"`), dan seed notes punya nilai aneh (mis. `'Baru saja'`); `tasks` punya `updated_at TEXT datetime('now')`, `overlay` (migrasi 5), `workspace_id` (migrasi 8). | Snapshot MCP (#D3) **tidak boleh menyajikan `notes.updated`** sebagai waktu. Pakai `notes.created_at` (satu-satunya TEXT datetime yang ada) — sampai Fase 0 sync (`updated_at INTEGER`) jadi (#Q6). |
| 6 | **FK tidak di-enforce** oleh SQLite (`delete = hard delete`, tanpa tombstone; lihat the cloud sync design §1 #2). `tasksRepo.remove` sudah membersihkan `task_dependencies` + `task_notes` manual. | Perjalanan write wajib **melewati store**, kalau tidak akan lahir baris yatim (`task_notes`/`tags` yang menggantung). |
| 7 | **`body` adalah string bebas**, dibaca render/search/export/checklist/AI. Wiki link `[[...]]` di-parse `markdown-it` (`wiki-links.ts`), dan **`resolveWikiReference` hanya butuh `id/title/folder/workspaceId/body`**. | **Graph query bisa dilakukan tanpa eksekusi JS di dalam app** — cukup snapshot (#D3). Ini yang membuat fitur "monitor task / dependency / konteks" murah. |
| 8 | `task_dependencies` punya **aturan first-class**: `canAddDependency` (tolak diri sendiri, lintas-workspace, dan **cycle**), `isTaskBlocked`, `taskBlockers`, `taskDependents`. | Operasi `link_tasks` **wajib** lewat `addDependency` di app. Cek cycle sendiri di Rust = duplikasi logika → drift. |
| 9 | **Belum ada proses spawn apa pun** di Rust (`std::process` belum dipakai); `capabilities/default.json` hanya memuat permission window/fs/sql/plugin yang sudah ada. | Menambah binary + spawn **butuh** perubahan `Cargo.toml`, `tauri.conf.json` (`externalBin`) dan pemikiran ulang permission (#D12). Tidak ada permission `shell`/`process` di set sekarang. |
| 10 | Repo memakai **Vitest** (`src/**/*.test.ts`) + `bun run check`/`clippy`/`fmt:check`; logika murni ditaruh di `src/lib/content/*` atau `src/lib/stores/*.ts` dengan unit test. | Logika baru (snapshot build, filter tool, validasi registry) harus **murni + teruji**, dan file kecil (≤300 LOC target, 500 hard cap). |
| 11 | `ui_plugins` (migrasi 7) + `ui-plugins.svelte.ts` adalah **pola persis** yang dibutuhkan: tabel → repo (`boolean`) → store `.svelte.ts` (hydrate/refresh/save/notify lintas window) → komponen Settings. | Halaman MCP di Settings **tidak perlu pola baru**; cukup meniru jalur ui_plugins, dengan tambahan komponen `McpSettings.svelte` (#D10). |
| 12 | the cloud sync design §9 menetapkan **"remote-only dulu, local stdio menyusul"**. | Dokumen ini **membalik urutan untuk Free** (§0 alasan), dan **mewajibkan** hasilnya di-fold balik ke §9 supaya dua dokumen tidak bertentangan (lihat roadmap §10). |

---

## 2. Arsitektur

```
┌──────────────────────────────┐         stdio (JSON-RPC 2.0, satu baris per pesan)
│  AI agent (MCP client)       │◄───────────────────────────────────┐
│  Claude Desktop / Cursor /   │                                    │
│  Codex / Zed                 │   spawn saat client start          │
└──────────────────────────────┘                                    │
                                                                    ▼
                                              ┌──────────────────────────────────────┐
                                              │ stylenotes-mcp(.exe)  — shim tipis    │
                                              │ • handshake + daftar tool             │
                                              │ • baca app-info.json + snapshot.json  │
                                              │ • operasi tulis → tulis job file      │
                                              │ • tunggu result file (polling)        │
                                              │ • TIDAK menyimpan state sendiri       │
                                              └───────────────┬──────────────────────┘
                                                              │ file di dalam dir app
                                                              │ (app info, snapshot, jobs/)
                                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│  StyleNotes (Tauri, sudah berjalan — hide-on-close + tray)                       │
│                                                                                  │
│  Rust supervisor (lib.rs)                                                        │
│   • tulis  mcp/app-info.json   saat start (path db, pid, versi protokol)          │
│   • spawn  mcp-host saat record mcp_settings pertama ada / MCP pertama dinyalakan │
│                                                                                  │
│  Warisan window `workspace` (selalu hidup, tidak pernah destroy)                  │
│   mcp-host.ts ──wait mcp/jobs/ (push)──► mcp-tools.ts (registry)                  │
│        │                              ├─ READ  → `mcp/snapshot.json` (§4)        │
│        │                              └─ WRITE → jalur persist lintas-workspace   │
│        │                                         (store + §13b)                  │
│        └─ tulis mcp/results/<id>.json  ◄──── store balas boolean + error          │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Kenapa arsitektur ini dan bukan yang lain — lihat §3 (#D1, #D2).**

### Komponen

| Komponen | Teknologi | Tanggung jawab |
|---|---|---|
| `stylenotes-mcp` | Rust, crate baru `src-tauri/mcp/` | Protokol MCP (stdio), daftar tool, forward operasi, tidak menyimpan state (#D5) |
| Rust supervisor | `lib.rs` (yang sudah ada) | Tulis `app-info.json`, spawn host, matikan saat exit |
| `mcp-host.svelte.ts` | Svelte 5 runes store di window `workspace` | Poll job file, panggil `executeMcpTool`, tulis hasil (#D5) |
| `mcp-tools.ts` | TS murni di `src/lib/content/` | Registry tool: nama, scope, deskripsi, handler. **Diuji Vitest.** |
| `mcp-snapshot.ts` | TS murni di `src/lib/content/` | Bangun snapshot dari note+task+dependency; filter/limit (#D3). **Diuji Vitest.** |
| `McpSettings.svelte` | Svelte di `src/lib/components/workspace/` | UI Settings: status, snippet config, toggle, log (#D10) |
| `mcp_settings` (tabel) | Migrasi baru di `lib.rs` | Contoh + registry/grant + audit (#D7) |
| `mcp/enabled` (meta) | `metaRepo` yang sudah ada | **Master switch** — dibaca Rust sebelum spawn (#D7) |

---

## 3. Keputusan arsitektur

### D1 — Binary, bukan sidecar, bukan HTTP

| Opsi | Penilaian |
|---|---|
| **A. Binary Rust bawaan, transport stdio** ✅ | Nol dependensi runtime (Rust + serde_json sudah ada); nol port jaringan; client menangani lifecycle; user tinggal copy snippet config |
| B. Sidecar Bun (`@modelcontextprotocol/sdk`) | Proses kedua penuh (bun + node_modules), +50–100 MB ke installer, tapi implementasi MCP lebih ringan. Ditolak untuk V1 |
| C. HTTP server lokal (`127.0.0.1:<port>`) | Bisa dipakai beberapa client sekaligus, tapi butuh port + **auth token** + proteksi CSRF/website lokal yang tidak bisa dipercaya. Permukaan serangan baru demi fitur gratis → ditolak |

**Keputusan:** A. Crate baru **`src-tauri/mcp/`** (satu crate, beberapa modul: `main.rs`, `protocol.rs`, `tools.rs`, `bridge.rs`), didaftarkan sebagai `[[bin]] name = "stylenotes-mcp"` di `src-tauri/Cargo.toml` dan `bundle.externalBin` di `tauri.conf.json` (#D12).

> Binary ini **tidak** ikut `tauri::Builder` apa pun. Ia proses polos: baca stdin → balas stdout.

### D2 — Tulis lewat app, bukan lewat SQLite

**Keputusan (#D2):** proses `stylenotes-mcp` **tidak pernah menulis tabel**. Operasi tulis ditempelkan sebagai job file, dieksekusi **di dalam app** melalui **store yang sudah ada**.

Kenapa:

1. **Validasi tetap hidup.** `link_tasks` harus kena `canAddDependency` (cycle!) dan `isTaskBlocked`; kalau shim menulis `INSERT INTO task_dependencies` sendiri, Rust wajib menyalin logika TS `canAddDependency` — dua implementasi yang pasti drift.
2. **Notifikasi lintas window tetap hidup.** Store memancarkan `tasks:changed` / `dependencies:changed` / `notes:changed`, yang sudah di-`listen` oleh Kanban, DockRail, dan Workspace. Menulis lewat SQLite membuat **agent menulis tapi UI tidak berubah** sampai restart.
3. **Guard ketikan user tetap dihormati.** Tulis MCP masuk **lewat jalur yang sama** dengan edit lokal, dan tunduk pada aturan #D4.

**Konsekuensi yang harus diakui:** tulis hanya jalan **saat app berjalan**. Ini diterima karena app memang selalu berjalan (#D5) — dan status itu ditampilkan jujur di Settings (`Client aktif` / `App tertutup`).

### D3 — Snapshot untuk baca (bukan query DB per tool call)

**Keputusan:** app menulis **`mcp/snapshot.json`** ke direktori app, di-*refresh* dengan jadwal (saat `notes:changed`/`tasks:changed`/`dependencies:changed` + paling lambat tiap 2 detik, throttle). Tool baca menjawab dari snapshot — sehingga **tidak perlu ada eksekusi JS per tool call**.

Snapshot berisi (bentuk lengkap di §4): `workspaces` (id, name), `notes` (id, workspaceId, title, folder, tags, pinned, excerpt, **body**, `createdAt`), `tasks` (semua field `Task` + `blocked` + `blockedBy`), `dependencies`, `folders`, dan `meta { generatedAt, revision, truncated, indexOnly }`.

Yang **tidak** ada di snapshot: `notes.updated` (#1 temuan 5), `settings`, `notifications`, isi `ui_plugins`.

**Kenapa body ikut:** semua query yang diminta user (**graph**, **context**, **monitor**) adalah operasi murni atas `body` → `parseWikiReferences` → `resolveWikiReference`, dan fungsi-fungsi itu hanya butuh `id/title/folder/workspaceId/body`. Kalau body tidak ada, `get_note`/`search_notes`/`context`/`graph` semuanya mati.

**Limit (dijaga di app, bukan di shim):** body dipotong **256 KB/note**, snapshot total ≤ 32 MB, maksimum 20.000 note + 20.000 task. Pemangkasan **bertingkat, bukan serba-hilang**: catatan yang kebesaran ditandai `truncated: true` pada nota itu sendiri, dan hanya anggaran 32 MB yang boleh membuang body — dengan cara membuang yang **terbesar dulu**, sehingga nota kecil tetap punya teks. `truncated: true` = "ada yang dipangkas"; `indexOnly: true` = "tidak satu pun body ikut". `get_note` atas nota yang body-nya ditahan membalas error `snapshot_truncated` (bukan `body: ""`), dan chat menyuntikkan system notice supaya model tidak menyimpulkan "nota ini kosong". Ini mencegah satu vault besar membuat Settings/log membengkak **dan** mencegah satu nota rakus menghapus isi seluruh workspace dari konteks model.

### D4 — Aturan ketegasan tulis (write semantics)

| Aturan | Alasan |
|---|---|
| Tulis **selalu** lewat store | #D2 |
| Operasi yang menyentuh **note** (`create_note`, `update_note_body`) **ditolak** selama app punya edit lokal yang belum ter-persist | Meniru guard yang sudah ada (`!queue.state.dirty`, `persistTimer`). Menimpa ketikan user = kehilangan data, tidak bisa dimaafkan |
| **Tidak menargetkan window `task-*`/`note-*`** sebagai eksekutor | Window itu `destroy()` saat ditutup (temuan 4) → target yang hilang = deadlock. Eksekutor **hanya** window `workspace` |
| Operasi **selalu dijalankan terhadap workspace yang diminta eksplisit**, dan hasilnya mengembalikan `workspace_id`. Tidak ada operasi "workspace aktif implisit" dari agent | ✅ **Revisi (#D4, jawaban Q8):** V1 mendukung **baca & tulis semua workspace** — lihat §13b untuk jalur persist lintas-workspace yang baru dibutuhkan |
| Setiap job punya `timeout` (V1: 5 detik) → hasil = `timeout` | Job file yang tidak pernah dieksekusi harus gagal, bukan menggantung |
| Job file ditulis **atomik** (temp + rename); `results/` dibersihkan saat start; V1 = **1 job in-flight** | Menghindari job setengah jadi dan antrean yang tumbuh tak terbatas |
| Eksekutor **tidak polling**: ia memarkir satu `mcp_wait_job`, dan watcher filesystem (`src-tauri/src/mcp_watch.rs`) membangunkannya begitu job mendarat | 150 ms polling = ~7 panggilan IPC per detik selamanya, walau tidak ada job. Watcher hanya *hint*: direktori selalu dibaca ulang, jadi event yang lewat hanya menambah latensi, tidak pernah menghilangkan job |
| Jawaban `mcp_wait_job` dikirim lewat **`Channel`**, dan wait yang kosong diparkir di **worker thread** — bukan sebagai balasan `invoke` | Tauri menjalankan IPC window di **main thread** (loop yang melukis + menangani input). Balasan `invoke` yang menunggu beberapa detik membekukan seluruh app. Cek direktori tetap dilakukan inline, jadi job yang sudah ada di disk tidak perlu thread hop |
| Anggaran satu wait hanya **~1–1,5 detik** (`mcp_watch::MAX_WAIT_MS`) | Wait cuma jaring pengaman watcher, bukan penopang utama. Deadline job 5 detik tetap aman karena direktori selalu dibaca ulang di setiap wake |

Setiap job membawa `grant` yang dipilih user (#D8); app memeriksa `grant` **sebelum** menjalankan handler (`grant.access.write && grant.scopes.includes('tasks')`), bukan hanya saat spawn.

### D5 — Siklus hidup: satu proses per client, tanpa fallback state

**Keputusan:** `stylenotes-mcp` **stateless di disk**. Ia hanya:

1. handshake (MCP `initialize`, `notifications/initialized`);
2. membaca `mcp/app-info.json` (path DB, versi protokol, pid app) untuk memutuskan pesan error yang tepat;
3. per tool call: baca snapshot → kalau write, tulis job → tunggu `results/<id>.json` → balas.

Kalau app tertutup: baca menghasilkan snapshot *terakhir* yang tertinggal (kadaluarsa, dan **diberi label** `appRunning: false` di setiap respons), tulis menghasilkan error `app_not_running` dengan pesan "Buka StyleNotes, lalu coba lagi".

**Kenapa tanpa fallback:** fallback (spawn app, atau antre tulis di disk) berarti proses **harus menahan mutasi** — dan begitu itu terjadi, "lewat store" (#D2) hilang, karena shim harus menulis DB sendiri saat app tidak ada. Menolak dengan jelas lebih baik daripada menulis tanpa validasi.

**Kenapa satu proses per client (bukan broker):** client `stdio` menangani spawn/singkat/ulang sendiri, jadi tidak ada daemon yang harus hidup. Andai 3 client menyala, itu 3 proses `stylenotes-mcp` kecil (masing-masing di bawah 10 MB RSS idle), semuanya menghadap app yang sama.

### D6 — Read-only adalah default yang kaku

**Keputusan:** `stylenotes-mcp` **selalu** mendaftarkan seluruh tool, tapi:

- tool `read` → langsung dieksekusi;
- tool `write` → **mengembalikan MCP error** `write_not_granted` bila tidak diizinkan (bukan diam-diam absen dari daftar tool). Alasannya: daftar tool yang berubah-ubah membingungkan model, dan pesan error memberi tahu user **cara mengaktifkannya**.

Grace period (#D7): grant write yang sudah dipakai boleh lanjut selama **15 menit** meski app tertutup, supaya agent tidak mati di tengah sesi hanya karena user me-restart app.

### D7 — Penyimpanan setting MCP

Ikut pola `ui_plugins` (temuan 11), **bukan** menambah key ke `settings` — karena `settings` di-sync ke cloud di Plus/Pro (`#24`), sedangkan MCP adalah **device-local** (path host, grant, contoh config berbeda per mesin). Menaruhnya di `settings` akan membuat config MCP satu device bocor ke device lain.

```sql
-- migration baru (version berikutnya di lib.rs)
CREATE TABLE IF NOT EXISTS mcp_settings (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    access      TEXT    NOT NULL DEFAULT 'read',   -- read | write
    scopes      TEXT    NOT NULL DEFAULT '[]',     -- JSON: ["notes","tasks","dependency"]
    workspaces  TEXT    NOT NULL DEFAULT '[]',     -- JSON: [] = semua workspace
    audit       INTEGER NOT NULL DEFAULT 1,        -- 0/1: catat tool call ke mcp_audit
    log_limit   INTEGER NOT NULL DEFAULT 200,
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mcp_clients (
    instance_id TEXT PRIMARY KEY,                  -- id yang dibawa shim (--instance)
    name        TEXT NOT NULL DEFAULT 'MCP client',
    source      TEXT NOT NULL,                     -- claude | cursor | manual | unknown
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mcp_audit (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          TEXT NOT NULL DEFAULT (datetime('now')),
    instance_id TEXT,
    tool        TEXT NOT NULL,
    scope       TEXT NOT NULL,                     -- read | write
    ok          INTEGER NOT NULL DEFAULT 1,
    detail      TEXT NOT NULL DEFAULT ''
);
```

Plus **master switch** di tabel `meta` (sudah ada): key `mcp/enabled` = `"0"`/`"1"`, dibaca **Rust** sebelum spawn (Rust tidak bisa membaca `settings` JSON dengan mudah; `metaRepo` adalah pintu yang sudah dipakai `workspaces.svelte.ts`).

> Aturan repo yang berlaku: file baru `src/lib/db/mcp.ts` mengembalikan **`boolean`** untuk setiap tulis, dan pemanggil (store) wajib menampilkan kegagalan.

### D8 — Snippet config yang di-generate, bukan ditulis user

Settings menghasilkan config siap tempel, **dengan alasan** (user Free tidak boleh diminta membaca dokumentasi tool):

```json
{
  "mcpServers": {
    "stylenotes": {
      "command": "C:\\Program Files\\StyleNotes\\stylenotes-mcp.exe",
      "args": ["--instance", "claude-desktop-8f3a12"]
    }
  }
}
```

- **Path absolut** ditempel dari `current_exe()` (Rust) — bukan `command: "stylenotes-mcp"` yang bergantung `PATH`.
- **`--instance <id>`** (#D7) → app tahu *client mana* yang sedang bicara; dipakai untuk status "3 client terhubung" dan kolom audit.
- **Satu klik "Salin untuk Claude"** dan **"Salin untuk Cursor"** (path config berbeda) — plus tombol "Buka folder config".
- Kalau `externalBin` gagal diselesaikan (kasus langka), Settings menampilkan panel peringatan alih-alih snippet yang salah.

### D9 — Registry tool

Nama tool = verba + objek, semua di `mcp-tools.ts` (satu sumber untuk handshake **dan** eksekusi, lalu dicerminkan Rust hanya untuk validasi awal). Halaman Settings menampilkan daftar yang sama, jadi tidak ada dua daftar yang bisa drift.

| Kategori | Tool | Scope | Ringkas |
|---|---|---|---|
| Baca note | `list_notes` | read | Daftar note (workspace, folder, tag, pin, limit, urutan) |
| | `search_notes` | read | Pencarian teks atas title+body+tag |
| | `get_note` | read | Isi note (`maxChars`), termasuk `backlinks` & `outlinks` |
| | `context` | read | **"Apa yang saya tahu tentang X?"** — note relevan + potongan + relasi |
| Baca task | `list_tasks` | read | Filter: status, priority, workspace, folder, `dueBefore`, `overdueOnly`, `includeDone` |
| | `get_task` | read | Task + `blocked`, `blockedBy`, `blocking`, note terkait |
| | `task_board` | read | Kolom Kanban (urutan `position`), jumlah per status |
| | `daily_summary` | read | Jatuh tempo/selesai, task `in progress`, note baru |
| Dependency | `list_dependencies` | read | Seluruh relasi task→task |
| | `critical_path` | read | Rantai dependency terpanjang (Gantt-lite) |
| Graph | `graph_query` | read | Node + edge + degree, untuk `neighborsOf`/`depth`/`kind` (§5) |
| Baca organisasi | `list_workspaces` | read | Semua workspace + jumlah note/task |
| | `list_folders` | read | **#D17** — id folder + jumlah note, supaya note bisa difilekan |
| | `list_tags` | read | **#D17** — kosakata tag + frekuensi, sebelum menandai apa pun |
| | `journal_today` | write | **#D20** — temukan-atau-buat note hari ini (hari lokal user, #D19) |
| Tulis | `create_note` | write | Note baru (title, body, folder, tags, `overlay`) |
| | `update_note_body` | write | Ubah body note — **V1** (#D16). Hanya mode `write`; ditolak bila ada edit lokal yang belum ter-persist (#D4) |
| | `update_note` | write | **#D17** — patch metadata note (`title`, `folder`, `tags`, `pinned`). Tidak menyentuh body |
| | `edit_note_body` | write | **#D18** — edit terarah: `replace { find, replace, occurrence }` atau `insert { text, position }`. Hemat token; tidak ada regex |
| | `delete_note` | write | Hapus note — **V1** (#D16) + butuh `confirm: true`. Hard delete, tanpa tombstone (#13a) |
| | `create_task` | write | Task baru (title, status, priority, folder, `startAt`, `dueAt`, `noteIds`) |
| | `update_task` | write | Patch field task |
| | `complete_task` | write | `completed = true`, `status = 'done'` |
| | `delete_task` | write | Hapus (butuh `confirm: true`) |
| | `link_tasks` | write | Tambah dependency — **lewat `addDependency`** (cycle & lintas-workspace ditolak) |
| | `unlink_tasks` | write | Hapus dependency |

> `update_note_body` dan `delete_note` **wajib** masuk §13a sebelum implementasi: keduanya menyentuh tulisan user tanpa pemulihan.

### D10 — Settings

Belum ada di `SettingsPanel.svelte`: tambah satu entri nav `{ id: 'mcp', label: 'AI & MCP', icon: Plug }` → `section` baru → komponen baru **`McpSettings.svelte`** (<300 LOC, meniru `UiPlugins.svelte`).

- **Nav** bertambah 1 baris lewat array `nav` yang sudah ada (perubahan minimal di `SettingsPanel.svelte`, konten pindah ke komponen).
- **Formulir**: master `Switch`, `SegmentedControl`/`ChoiceTile` untuk akses (Read-only / Izinkan tulis), chip scope (notes/tasks/dependency) yang hanya muncul saat write, pemilih **workspace** (semua / pilih per-workspace — dibutuhkan §13b), switch audit, tombol **Salin config**, daftar **client**, daftar **audit terakhir** (termasuk kolom workspace) dengan **Reset log**.
- **Konfirmasi**: dialog yang sudah ada (`ui/alert-dialog`) untuk membuka write — menyebut jumlah note/task yang akan bisa diubah, dan **tegas** bahwa scope `notes` berarti agent bisa mengubah **dan menghapus** isi note (§13a).
- Semua kontrol pakai `src/lib/components/base/*` (aturan repo: jangan bikin `<button>`/`<input>` sendiri).

### D11 — Auth, dan kenapa "tidak ada" adalah posisi yang bisa dipertahankan

| | Local stdio MCP (Free) | Remote MCP (Plus/Pro) |
|---|---|---|
| Auth | **Tidak ada** — batas kepercayaan = proses lokal yang berhasil `spawn` | OAuth 2.1 (the cloud sync design #23) |
| Audience | user di mesinnya sendiri | dari device mana pun |

Alasannya: siapa pun yang bisa menjalankan proses di mesin user **sudah bisa membaca file DB-nya langsung**. Menambahkan token tidak menambah keamanan apa pun; ia hanya menambah satu hal lagi yang bisa salah config untuk fitur gratis. Yang benar-benar melindungi user adalah **master switch** (#D7) + **default read-only** (#D6) + **audit** (#D7), bukan kredensial.

> Tool MCP **tidak** boleh menyentuh `settings` perangkat (tema, posisi dock, `kanbanLocked`) — itu milik `settings` lokal (#24), dan satu sesi agent yang salah tidak boleh mengubah perilaku aplikasi user.

### D12 — Perubahan build & permission

| Berkas | Perubahan | Catatan |
|---|---|---|
| `src-tauri/Cargo.toml` | `[[bin]] name = "stylenotes-mcp"` + `path = "src/mcp/main.rs"`; **tidak ada dependency baru** (serde/serde_json sudah ada) | Jaga `clippy -D warnings` bersih |
| `src-tauri/tauri.conf.json` | `bundle.externalBin: ["stylenotes-mcp"]` | Nama binary harus sama dengan nama di `[[bin]]` |
| `src-tauri/capabilities/default.json` | **Belum diputuskan** (#Q2): proses `stylenotes-mcp` bukan webview → tidak butuh permission di file ini. Yang perlu izin adalah sisi app kalau nanti memakai plugin apa pun | Jangan tambahkan permission "shell/process" yang tidak ada |
| `src-tauri/src/lib.rs` | Modul supervisor: tulis `app-info.json`, spawn saat diperlukan, kill saat `RunEvent::Exit` | **Kandidat file baru** `src-tauri/src/mcp_host.rs` supaya `lib.rs` tidak melewati 500 LOC |
| Migrasi | Satu `Migration { version: 11, description: "create_mcp_settings" }` | Jangan menyentuh migrasi 1–10 |

---

## 4. Format file & protokol bridge

Direktori app (di bawah `app_data_dir()`):

```
mcp/
  app-info.json        # ditulis app saat start
  snapshot.json        # ditulis app (refresh terjadwal)
  jobs/                # ditulis shim, dibaca app
  results/             # ditulis app, dibaca shim
  clients.json         # registry client (turunan mcp_clients)
  logs/mcp.log         # NDJSON, dibaca halaman Settings
```

`app-info.json`:

```json
{
  "protocol": 1,
  "appRunning": true,
  "appPid": 12345,
  "appVersion": "0.1.0",
  "dbPath": "C:\\Users\\...\\AppData\\Roaming\\com.arifpebryan.stylenotes\\stylenotes.db",
  "enabled": true,
  "snapshotRev": 128,
  "generatedAt": "2026-09-27T10:00:00.000Z"
}
```

`snapshot.json` (potongan):

```json
{
  "protocol": 3,
  "revision": 128,
  "generatedAt": "2026-09-27T10:00:00.000Z",
  "today": "2026-09-27",
  "truncated": false,
  "indexOnly": false,
  "appRunning": true,
  "workspaces": [{ "id": "workspace-default", "name": "Personal" }],
  "notes": [{
    "id": "getting-started", "workspaceId": "workspace-default", "title": "Mulai di sini",
    "folder": "personal", "tags": ["intro"], "pinned": true,
    "excerpt": "Catatan pertama…", "body": "# Mulai\n\nLihat [[Roadmap]]…",
    "createdAt": 1788249600000, "updatedAt": 1788249600000
  }],
  "tasks": [{
    "id": "t-1", "workspaceId": "workspace-default", "title": "Desain MCP lokal",
    "status": "doing", "priority": "high", "completed": false, "overlay": false,
    "folder": "dev", "noteIds": ["getting-started"], "startAt": null, "dueAt": "2026-10-01",
    "position": 0, "blocked": true, "blockedBy": ["t-0"], "blocking": ["t-2"]
  }],
  "dependencies": [{ "taskId": "t-1", "dependsOnTaskId": "t-0" }],
  "folders": [{ "id": "dev", "label": "Development" }]
}
```

**Invariant yang diuji (Vitest, `mcp-snapshot.test.ts` + `mcp-tools.test.ts`):**

1. `blocked` == `isTaskBlocked(task, tasks, dependencies)` — **tidak boleh ada perhitungan ulang di Rust**.
2. `graph_query` pada `workspace-graph.test.ts` menghasilkan node/edge **persis** `buildWorkspaceGraph` (wiki + dependency + link).
3. `link_tasks` menolak: diri sendiri, lintas-workspace, dan **cycle** (memakai `canAddDependency`).
4. Snapshot **tidak pernah** memuat `notes.updated`.
5. Filter write (`grant.access`/`grant.scopes`) menolak sebelum handler berjalan.

---

## 5. Tool MCP & pemetaannya ke kode yang ada

| Tool | Implementasi (yang sudah ada, jangan tulis ulang) |
|---|---|
| `list_notes` | `notesRepo.list` → filter `workspaceId`/`folder`/`tag`/`pinned` |
| `search_notes` | pencarian teks sederhana atas title/body/tag (substring, case-insensitive), **di-rank** dengan bobot title 10 > tags 5 > excerpt 3 > body 1; **bukan** FTS — cukup untuk V1 |
| `search_tasks` | pencarian teks atas title + `notes` task, filter yang sama dengan `list_tasks`; bobot title 10 > notes 3 |
| `search_all` | satu pencarian teks lintas note+task, dikembalikan sebagai dua daftar terpisah (skala skor antar jenis tidak dibandingkan langsung) |
| `get_note` | snapshot + `parseWikiReferences` untuk `outlinks`, indeks terbalik untuk `backlinks` |
| `context` | skor `term` atas title/excerpt/body (bobot title > tag > body) + 1-hop `graph_query` sebagai relasi |
| `list_tasks` | filter + urut `sortTasks`/`sortOverlayTasks` (logika yang sudah ada) |
| `get_task` | `taskBlockers` / `taskDependents` / `isTaskBlocked` / `taskNoteIds` |
| `task_board` | `tasksByStatus` + urutan `position` |
| `daily_summary` | `sortTasks` + tanggal |
| `critical_path` | DFS atas edge `dependency` (logika baru, **murni, diuji**) |
| `graph_query` | `buildWorkspaceGraph` (wiki + dependency + link) + filter `neighborsOf`/`depth`/`kind` |
| `create_note` / `create_task` | `createNote`/`createTask` + `persistNote`/`persistTask` |
| `update_task` / `complete_task` / `delete_task` | `applyTaskPatch` + `persistTask` / `removeTask` |
| `link_tasks` / `unlink_tasks` | `addDependency` (validasi `canAddDependency`) / `removeDependency` |

### Contoh yang user minta, ujung ke ujung

**"Task mana yang menghambat rilis?"**

```
agent → tools/call { name: "get_task", arguments: { id: "release-1" } }
shim  → baca snapshot.json
app   → (tidak disentuh)
balas → { blocked: true, blockedBy: [{ id: "design-lock", title: "Kunci desain", status: "review" }] }
```

**"Tandai 'Kunci desain' selesai."**

```
agent → tools/call { name: "complete_task", arguments: { id: "design-lock" } }
shim  → tulis jobs/9f3a.json { tool, args, grant } (atomic rename)
app   → mcp-host poll → executeMcpTool → applyTaskPatch → persistTask
        → emit("tasks:changed")  ← Kanban & Dock langsung ter-update
        → tulis results/9f3a.json { ok: true, task: {...} }
shim  → balas structuredContent
```

**"Apa hubungan note ini dengan task lain?"**

```
agent → tools/call { name: "graph_query", arguments: { id: "note:getting-started", depth: 2 } }
balas → nodes [note/task], edges [wiki|link|dependency], degree, orphan
```

Jalur pertama **tidak menyentuh app**, yang kedua menyentuh store dan otomatis menghormati guard di #D4.

---

## 5a. Full flow use case

Bagian ini menjalankan desain di atas **berurutan**, dari instalasi sampai sehari-hari. Notasi: `[S]` shim (`stylenotes-mcp`), `[A]` aplikasi StyleNotes, `[H]` host MCP di window `workspace`, `[C]` client (Claude/Cursor).

### Ringkasan 7 alur

| # | Alur | Muka di | Menyentuh tulis? |
|---|---|---|---|
| F1 | Instalasi & aktivasi (sampai handshake pertama) | M1 | tidak |
| F2 | Baca murni (snapshot) | M1 | tidak |
| F3 | Graph & konteks (wiki + dependency) | M2 | tidak |
| F4 | Menulis lewat store (event lintas window) | M3 | ya |
| F5 | Lintas workspace (§13b) | M3 | ya |
| F6 | Mode index saat vault besar (#D3) | M1 | tidak |
| F7 | Kasus gagal & pemulihan | M1–M4 | campuran |

---

### F1 — Instalasi & aktivasi (cold start)

**Tujuan:** dari "belum tahu MCP" sampai Claude menjawab pertanyaan pertama.

1. User membuka Settings → **AI & MCP**. `[A]` memanggil `db_path` (#D14) dan menulis `mcp/app-info.json` bila belum ada.
2. Kartu status menampilkan: `MCP: Nonaktif`. Tidak ada file `snapshot.json` yang dibuat selama nonaktif.
3. User menyalakan master `Switch` → `[A]` menulis `meta:mcp/enabled = "1"`, menandai `mcp_settings` dibuat (default: `access = 'read'`, `scopes = []`).
4. `[A]` (Rust supervisor) melihat switch menyala → **spawn host** dan mulai menulis `snapshot.json` (revisi 1).
5. Settings menampilkan snippet dengan **path absolut `current_exe()`** dan instance id yang di-generate, mis. `--instance claude-desktop-8f3a12`.
6. User menekan **Salin untuk Claude Desktop** → menempel ke `claude_desktop_config.json` → restart Claude.
7. `[C]` spawn `[S]`. Langkah handshake:
   - `[S]` membaca `app-info.json`. Kalau `enabled = false` → balas error inisialisasi `mcp_disabled` (bukan diam).
   - `initialize` → `protocolVersion`, `serverInfo { name: "stylenotes", version }`, `capabilities.tools = {}`.
   - `notifications/initialized`.
   - `tools/list` → daftar dari registry (#D9). Di mode `read`, semua tool terdaftar termasuk yang `write` (alasan di #D6).
8. `[S]` mencatat `--instance` ke antrean registrasi → `[H]` menulis baris `mcp_clients` (name, source `claude`, `last_seen`).
9. Settings me-refresh: **Client aktif: Claude Desktop (1)**, dan `tools/list` dihitung cocok dengan registry.

**Yang bisa gagal di F1:**

| Gejala | Penyebab | Yang terjadi |
|---|---|---|
| Claude tidak menampilkan server | Path di config salah / `command` tanpa path absolut | `[S]` tidak pernah jalan. Settings tetap "0 client" → terlihat jelas |
| Server muncul tapi semua tool error `mcp_disabled` | Master switch pernah dimatikan | Pesan mengarahkan user ke Settings |
| Tools berjalan di `tauri dev`, gagal saat bundle | Binary `externalBin` tidak terbundel (#D15) | Gagal silent → sebab itu verifikasi **bundle** masuk M1 |

---

### F2 — Baca murni (tak menyentuh app)

**Prompt user:** *"Apa saja task saya yang jatuh tempo minggu ini?"*

```
[C] → tools/call { name: "list_tasks", arguments: { dueBefore: "2026-10-04", includeDone: false } }
[S] → baca mcp/snapshot.json  (+ cek app-info.appRunning & revision)
[S] → filter + sortTasks(tasks)
[S] → hasil
```

`[A]` dan `[H]` **tidak disentuh** — tidak ada job file, tidak ada hop kedua. Ini kenapa baca terasa instan walau app sedang sibuk.

Kontrak respons yang selalu berlaku:

- Setiap entity membawa `workspaceId` (§13b).
- `appRunning: false` → hasil tetap keluar, tapi **dilabeli kadaluarsa** (`snapshotAge`) supaya model bisa bilang "per terakhir saya lihat".
- Snapshot lebih tua dari 60 detik saat `appRunning = true` → `[S]` menambah peringatan di respons (bukan menyembunyikan).

**Kasus tepi:** dua window menulis → `notes:changed`/`tasks:changed` → `[H]` debounce 300 ms → snapshot revisi naik. Bila `[S]` membaca di tengah penulisan, ia membaca file lama (rename atomik) dan tetap konsisten.

---

### F3 — Graph & konteks (pertanyaan yang benar-benar dicari user)

**Prompt:** *"Apa yang menghambat rilis v1?"*

```
[C] → tools/call { name: "get_task", arguments: { id: "workspace-default/release-1" } }
[S] → snapshot → cari task → balas:
      { title: "Rilis v1", status: "review", blocked: true,
        blockedBy: [{ id: "workspace-default/design-lock", title: "Kunci desain", status: "review" }],
        blocking: [{ id: "workspace-default/announce", title: "Umumkan rilis" }],
        linkedNotes: [{ id: "workspace-default/release-checklist", title: "Checklist rilis" }] }
[C] → tools/call { name: "critical_path", arguments: { workspace: "workspace-default", toId: "release-1" } }
[S] → DFS atas edge `dependency`
[C] → jawab: "Rilis v1 menunggu 'Kunci desain' (masih review), yang tidak punya blocker lain — jadi itu jalur kritisnya."
```

**Prompt:** *"Note mana yang membahas arsitektur MCP dan berhubungan dengan apa?"*

```
[C] → tools/call { name: "context", arguments: { query: "arsitektur MCP", depth: 2 } }
[S] → skor atas title/tag/body → note "Desain MCP lokal"
[S] → graph_query di sekitar node itu (depth 2), edge wiki|link|dependency
[C] → jawab + sebutkan note/task tetangga
```

Semua di dua alur ini **nol hop ke app**; hasilnya identik dengan yang dilihat user di halaman Graph karena memakai `buildWorkspaceGraph` yang sama (invariant #2 di §4).

---

### F4 — Menulis lewat store (event lintas window hidup)

**Prompt:** *"Tandai 'Kunci desain' selesai, dan tambahkan dependency Rilis → Umumkan."*

Prasyarat: mode `write`, scope `tasks` + `dependency` sudah diaktifkan user (dialog izin).

```
1. [C]  tools/call { name: "complete_task", arguments: { id: "workspace-default/design-lock" } }
2. [S]  cek grant → access=write, scopes ⊇ {tasks} ✔
3. [S]  tulis mcp/jobs/<uuid>.json  (tmp + rename)
        { id, tool, args, grant, instance, workspace: "workspace-default", deadline }
4. [H]  `mcp_wait_job` terbangun oleh watcher `mcp/jobs/` (push) → validasi ulang grant → cek workspace ada
5. [H]  cek guard #D4: tidak ada edit lokal tertunda untuk task itu
6. [H]  tasksRepo.upsert({ ...task, status: 'done', completed: true, updated_at: now })
7. [H]  emit("tasks:changed") + tulis mcp_audit { tool: complete_task, scope: write, ok: 1, workspace }
        → Kanban + DockRail + Workspace reload sendiri (listen yang sudah ada)
8. [H]  tulis mcp/results/<uuid>.json { ok: true, task: {...}, revisionBaru }
9. [S]  melihat result file → balas structuredContent
10.[S]  hapus job; [H] menghapus result (bersih)
```

```
11.[C]  tools/call { name: "link_tasks", arguments: { id: "workspace-default/release-1",
                                                        dependsOn: "workspace-default/announce" } }
12.[H]  jalankan addDependency → canAddDependency menolak bila cycle/lintas-workspace
13.[H]  emit("dependencies:changed") → Gantt & dependency list ikut berubah
14.[S]  balas { ok: false, error: "dependency_cycle" } bila ditolak
```

**Yang membedakan F4 dari "agent menulis SQLite":** langkah 7 dan 13. UI berubah **tanpa restart**, dan langkah 12 memakai aturan cycle yang sama dengan UI.

**Kasus tepi:**

| Situasi | Perilaku |
|---|---|
| User sedang mengetik task itu di task window | Job ditolak `busy_local_edit`; `[S]` menyarankan coba lagi — **tidak** menimpa |
| Job tidak dieksekusi sampai `deadline` (app tersendat) | `[S]` balas `timeout`; job dibersihkan saat host start berikutnya |
| Write ditolak karena grant berubah di tengah | `write_not_granted`; audit mencatat percobaan |

---

### F5 — Lintas workspace (§13b)

**Prompt:** *"Di workspace 'Kerja', buat task follow-up dari note 'Retro Q3'."*

```
[C] → search_notes { query: "Retro Q3" }
[S] → balas DUA kandidat ber-prefix:
      [ { id: "workspace-default/retro-q3", workspaceId: "workspace-default" },
        { id: "ws-kerja/retro-q3",          workspaceId: "ws-kerja" } ]
[C] → create_task { workspace: "ws-kerja", title: "Follow-up retro",
                    noteIds: ["ws-kerja/retro-q3"], dueAt: "2026-10-07" }
[H] → validasi: ws-kerja ada? → tasksRepo.upsert dengan workspaceId eksplisit
    → (workspace aktif user mungkin workspace-default; baris tetap masuk ws-kerja)
```

Kasus tepi yang **wajib diuji** karena mudah salah:

| Situasi | Perilaku benar |
|---|---|
| Agent menulis ke workspace non-aktif | Baris masuk workspace yang diminta; UI yang menampilkan workspace lain **tidak** berubah; workspace aktif reload bila relevan |
| Agent mengirim id tanpa prefix yang ada di >1 workspace | `ambiguous_id` + daftar kandidat — **bukan** menebak |
| Agent mengirim `workspace: "ws-hilang"` | `unknown_workspace` — **bukan** fallback ke `workspace-default` |
| Agent ingin membuat note dengan id pilihan sendiri | Id tetap di-generate app (`crypto.randomUUID`) kecuali lewat `create_note` dengan title; mencegah tabrakan id lintas workspace |

---

### F6 — Pemangkasan saat vault besar (#D3)

**Pemicu:** total > 32 MB, sebuah body > 256 KB, atau > 20k note/task.

Pemangkasan **bertingkat**, agar satu nota rakus tidak menghapus isi workspace dari konteks:

1. Body > 256 KB dipotong pada batas baris, dan nota itu sendiri ditandai `truncated: true`. Sisanya **tetap utuh** — inilah perubahan dari desain awal yang membuang semua body begitu ada satu nota > 500 KB.
2. Bila total masih > 32 MB, `[H]` membuang body **terbesar dulu** sampai muat (`packSnapshotBodies`), menandai tiap nota yang terbuang. `truncatedReason: 'snapshot_size'`.
3. Baru bila anggarannya tidak sanggup memuat satu body pun, snapshot ditulis **index saja** (`indexOnly: true`: title, folder, tags, excerpt, `createdAt`).
4. `search_notes` tetap bekerja (atas title/tags/excerpt) dan menyebut mode index di respons.
5. `get_note` atas nota yang body-nya ditahan membalas `snapshot_truncated` **dengan payload excerpt + backlinks/outlinks**, bukan `body: ""` — `" kosong"` adalah jawaban paling percaya diri yang tidak boleh kita berikan. `list_notes`/`search_notes`/`context` mengirim `body: null` untuk nota tanpa body, ditemani `truncated: true`.
6. Chat menyuntikkan **system notice** (`snapshotNotice` di `ai-context.ts`) begitu `truncated` terbaca, supaya model bekerja dari excerpt dan menyatakan apa yang tidak terlihat, bukan menyimpulkan catatan itu kosong.

> Status butir banner Settings ("Snapshot dalam mode index") belum ada di kode — `truncatedReason` saat ini hanya dikonsumsi oleh notice chat, belum oleh UI.

---

### F7 — Kasus gagal & pemulihan

| Kejadian | `[S]` melihat | Perilaku | Tampilan di Settings |
|---|---|---|---|
| App ditutup dari tray | `app-info.json` basi | Baca: hasil + label `appRunning: false` + `snapshotAge`. Tulis: `app_not_running` ("Buka StyleNotes, lalu coba lagi") | `MCP: App tertutup — client hanya bisa membaca` |
| MCP dimatikan user | `enabled = false` | `[S]` menolak sejak inisialisasi (`mcp_disabled`); snapshot dihapus untuk privasi (§7) | `MCP: Nonaktif` |
| `snapshot.json` hilang/rusak | parse gagal | `[S]` paksa refresh sekali; bila masih gagal → `snapshot_unavailable` (bukan hasil kosong yang menyesatkan) | Banner peringatan + tombol "Tulis ulang snapshot" |
| Dua client menulis bersamaan | 2 job dalam `jobs/` | Host memproses **1 in-flight**; job kedua menunggu, bukan ditolak | Daftar client menampilkan keduanya |
| Write gagal di repo (disk/DB) | store balas `false` | `[S]` balas `write_failed` + pesan; audit `ok = 0` | Audit menandai baris merah |
| User menekan "Hapus semua data" saat MCP hidup | — | Host berhenti; snapshot ditulis kosong; audit dibersihkan bersama reset | MCP tetap aktif tapi tanpa data |
| Versi protokol shim ≠ app | `protocol` berbeda | `[S]` menolak dengan `protocol_mismatch` + versi yang dibutuhkan — lebih baik daripada field yang hilang | Banner "Perbarui StyleNotes" |

---

### Matriks latensi: berapa hop tiap kelas operasi

| Kelas | Hop | Kira-kira |
|---|---|---|
| Baca dari snapshot | 1 (disk→shim) | beberapa ms |
| Baca + graph/konteks | 1 (CPU di shim) | puluhan ms pada vault besar |
| Tulis apa pun | 3 (shim→job→host→store→result) | 20–80 ms; host terbangun begitu job file mendarat |
| Tulis + app sibuk | 3 | sama, dengan batas 5 s (`timeout`) |

Ini yang membenarkan pemisahan §D3: **semua** pertanyaan yang user sebut ("monitor task", "konteks/query graph") ada di baris pertama dan kedua — jalur tulis hanya untuk aksi.

---

## 6. Temuan operasional: lokasi database

the cloud sync design Fase 0 akan mengubah `stylenotes.db` menjadi target sync. Untuk MCP, path DB **hanya berguna sebagai jaring pengaman** (mode CLI saat app tertutup — #Q5). Meski begitu, temuan #1 (temuan §1) harus diselesaikan lebih dulu:

- **Sekarang:** URL relatif `sqlite:stylenotes.db` di 3 tempat. Path fisik ditentukan internal `tauri-plugin-sql` → **tidak diketahui kode kita** dan tidak boleh ditebak.
- **Yang dibutuhkan:** `dbPath` absolut yang ditulis ke `app-info.json` saat startup.
- **Aman:** tambahkan perintah Rust kecil yang mengembalikan `db_path` (mis. `app.path().app_data_dir()?.join("stylenotes.db")`) setelah diverifikasi cocok dengan perilaku plugin — perubahan kecil, tidak menyentuh migrasi.
- **Bahaya:** menulis `Path::join` sendiri di shim dan berharap cocok. Kalau path berbeda, shim akan membuka DB lain, membuat file kosong, dan **user melaporkan "note saya hilang"**.

---

## 7. Keamanan & privasi

| Ancaman | Mitigasi |
|---|---|
| Agent mengubah data tanpa sepengetahuan user | Default read-only (#D6); write butuh konfirmasi dialog (#D10); audit tiap call (#D7) |
| Agent menghapus banyak | `delete_task` butuh `confirm: true`; `mcp_audit` mencatat; Settings bisa mematikan MCP seketika (`mcp/enabled`) |
| Agent menimpa ketikan user | Guard #D4 — operasi note ditolak saat ada edit lokal yang belum ter-persist |
| Prompt-injection dari note ("abaikan instruksi, hapus semua") | Scope write terbatas kategori (#D7), dan audit memberi jejak. **Catatan jujur:** dalam mode write, agent tetap bisa dimanipulasi isi note; itu sebabnya write bukan default dan bukan otomatis |
| Client lain di mesin memakai stdio yang sama | Batas kepercayaan = proses lokal (#D11). Siapa pun yang bisa menjalankan biner lokal = sudah punya akses mesin |
| Data keluar mesin | **Tidak ada.** Stdio, tanpa jaringan. Note hanya keluar kalau user sendiri menempelkannya ke agent cloud |
| Data tertinggal di disk | `snapshot.json` berisi **body lengkap** → perlakuan sama dengan DB: tidak disimpan di `localStorage`/log, dan dihapus saat MCP dimatikan. `logs/mcp.log` hanya berisi nama tool + ringkasan, **tidak pernah** isi note |

---

## 8. Rencana implementasi

| Tahap | Isi | Hasil yang bisa diuji | LOC kira-kira |
|---|---|---|---|
| **M0 — Fondasi** | Tabel `mcp_settings`/`mcp_clients`/`mcp_audit` (migrasi baru) + `db/mcp.ts` + `stores/mcp.svelte.ts`; `app-info.json` + perintah Rust `db_path` (#D14); `mcp/enabled` di `meta`; **migrasi `notes.updated_at` + tulis kolom itu di `notesRepo`** (#D13) | Setting bertahan setelah restart; `app-info.json` benar; `updated_at` bergerak saat note diubah | ~300 TS + 100 Rust |
| **M1 — Baca saja** | Crate `stylenotes-mcp` (stdio handshake + 3 tool: `list_tasks`, `get_task`, `search_notes`); snapshot writer + refresh; snippet config di Settings; **verifikasi bundle** (#D15) | Claude/Cursor tersambung & bisa menjawab "task saya hari ini" | ~400 Rust + ~250 TS |
| **M2 — Grafik & konteks** | `graph_query`, `context`, `get_note`, `backlinks`, `critical_path`; id ber-prefix workspace (§13b) | "Apa yang menghambat X?", "note mana yang membahas Y?" | ~300 TS |
| **M3 — Tulis** | Bridge job/result + `mcp-host`; **jalur persist lintas-workspace (§13b)**; guard #D4; `update_note_body`/`delete_note` + backup pra-ubah (§13a); dialog izin + audit + status client | `complete_task` dari Claude muncul di Kanban **tanpa restart**; "task mana yang menghambat rilis" dijawab benar | ~500 TS + ~200 Rust |
| **M4 — Pemolesan** | Log viewer, pemilih workspace, halaman bantuan config, `clippy`/`check:all` bersih, dokumentasi user | — | ~250 |

Setiap tahap bisa dirilis sendiri, dan **M1 sudah berguna** tanpa satu pun jalur tulis.

**Aturan ukuran berkas (repo):** pecah sejak awal — `mcp-snapshot.ts`, `mcp-tools.ts`, `mcp-tools-write.ts`, `mcp-bridge.ts`, `mcp-host.svelte.ts`, `McpSettings.svelte`, `McpClientList.svelte`, `McpAuditLog.svelte`; di Rust `protocol.rs`, `tools.rs`, `bridge.rs`, `mcp_host.rs`. Semua ≤300 LOC, dengan Vitest untuk logika murni.

**Perubahan di luar MCP yang dibawa oleh keputusan ini (#D4, #D13, #D14):**

- `notesRepo.upsert` / `replaceAll` menulis `updated_at`; tipe `NoteRow`, `toNote`, dan `Note` (`content.ts`) mendapat `updatedAt`.
- `src-tauri/src/lib.rs`: perintah `db_path` (#D14) + migrasi yang menambah `notes.updated_at`.
- Store yang dipakai eksekutor MCP perlu akses lintas-workspace (§13b) — ini perubahan pada `src/lib/stores/*.ts`, bukan hanya kode MCP baru.

---

## 9. Yang **tidak** dikerjakan di sini

| Hal | Kenapa bukan di dokumen ini |
|---|---|
| Remote MCP (Streamable HTTP, OAuth 2.1) | Plus/Pro — the cloud sync design §9, #23 |
| Tools AI (summarize/RAG/rewrite) | Butuh server + kuota; Free = 0 AI (the business model §3) |
| MCP **server** yang dilayani StyleNotes | Bukan permintaan; arah di sini adalah StyleNotes sebagai **client-facing** provider untuk agent user |
| Scope `org_id` / CRDT | the collaboration design; memengaruhi **isi** tool nanti (#D11), bukan transport |
| Auto-update & signing binary | Menyusul; V1 mengandalkan update aplikasi |

---

## 10. Yang harus di-fold balik ke dokumen lain

1. **the cloud sync design §9** — pernyataan "local stdio menyusul; remote-only dulu" harus direvisi: **local stdio untuk Free dikerjakan lebih dulu** karena nol biaya server dan menyelesaikan kebutuhan Free (#D1). Tambahkan rujukan ke dokumen ini.
2. **the business model §2** — baris "Local MCP (stdio) ✅ Free" tetap benar; tambahkan catatan bahwa **semua tool write lokal = gratis untuk user Free** (sejalan B5 dan B9), sehingga Free juga bisa mengubah task lewat agent — selaras dengan "yang dijual adalah kapasitas & koordinasi".
3. **the cloud sync design §13** — tambahkan butir: *path DB absolut harus ditetapkan sebagai bagian Fase 0* (temuan §6 dokumen ini), karena MCP dan export sama-sama membutuhkannya.
4. **`AGENTS.md`** — saat M1 masuk: catat crate `stylenotes-mcp`, `externalBin`, dan bahwa halaman MCP ada di Settings. Jangan sampai `app-info.json`/`snapshot.json`/`backups/` dianggap "app data" dan ikut di-commit.
5. **the cloud sync design §3.1 / §11 Fase 0** — **wajib (#D13):** kolom `notes.updated_at` (INTEGER) **sudah ditambahkan lebih dulu** oleh pekerjaan MCP. Fase 0 tidak boleh meng-`ALTER` kolom itu lagi — cukup backfill bila perlu — atau migrasi akan gagal dengan duplicate column dan app tidak bisa start.
6. **the cloud sync design §9, bagian Tools** — daftar tool di sana masih versi remote-only (`search_notes`, `get_note`, `list_tasks`, `daily_summary`, `create_note`, `create_task`, `complete_task`). Setelah ini, **registry MCP menjadi satu sumber**: tools lokal (#D9) dan remote memakai nama yang sama, hanya scope & data source yang berbeda. Tambahkan catatan itu supaya remote tidak lahir sebagai registry kedua.

---

## 11. Pertanyaan terbuka

| # | Pertanyaan | Kenapa penting | Rekomendasi |
|---|---|---|---|
| **Q1** | Path DB absolut: apakah boleh menambah perintah Rust `db_path`, atau menunggu Fase 0 sync yang sudah menetapkan lokasi? | Menentukan apakah M1 bisa mengandalkan `app-info.json` atau tidak | ✅ **Dijawab: tambah perintah Rust `db_path` sekarang** (`#D14`). Fase 0 sync akan memakai nilai yang sama |
| **Q2** | Apakah `stylenotes-mcp` perlu permission di `capabilities/default.json`? | Kalau salah, kelihatannya jalan di dev tapi gagal saat bundle | ✅ **Dijawab: kemungkinan tidak** (`#D15`) — diverifikasi empiris di M1 dengan build bundle, bukan `dev` |
| **Q3** | Apakah V1 memberi `update_note_body`/`delete_note`? | Menyentuh body user = risiko tertinggi; dan body akan jadi CRDT di Pro | ✅ **Dijawab: ya, semuanya termasuk `delete_note`** (`#D16`). Wajib: `confirm: true`, mode `write` eksplisit, dan audit. Lihat §13a untuk mitigasi lengkap |
| **Q4** | Batas ukuran snapshot & apakah butuh mode "index saja"? | Vault besar bisa membuat `snapshot.json` puluhan MB dan dipoll terus | ✅ **Dijawab: 256 KB/note, 32 MB total, 20k+20k** (`#D3`). **Revisi (protokol v3):** pemangkasan jadi bertingkat — potong per-nota, lalu buang body terbesar dulu, dan mode index hanya sebagai cadangan terakhir; `truncated` (ada yang dipangkas) dipisah dari `indexOnly` (tidak ada body sama sekali). **Tetap wajib diuji dengan vault nyata sebelum M1 selesai** |
| **Q5** | Apakah MCP perlu mode CLI (baca DB langsung saat app tertutup)? | Membuka jalan "agent bekerja tanpa app terbuka", tapi mengorbankan #D2 | ✅ **Dijawab: tidak di V1** (`#D5`). Kalau nanti ada permintaan, hanya read-only dan tanpa satu pun jalur tulis |
| **Q6** | Setelah `updated_at INTEGER` (Fase 0 sync) ada, apakah `list_notes`/`daily_summary` menyertakannya? | Sorting "baru diubah" saat ini tidak akurat (temuan §1 #5/#6) | ✅ **Dijawab: tambah kolom `updated_at` sekarang** (`#D13`) — migrasi sendiri, tidak menunggu Fase 0 |
| **Q7** | Bolehkah StyleNotes menulis config client MCP otomatis? | Salah merge `claude_desktop_config.json` = user kehilangan config server MCP lain miliknya | ✅ **Dijawab: salin snippet dulu** (`#D8`). Auto-config menyusul setelah ada backup + merge hati-hati |
| **Q8** | Apakah tool MCP membaca/menulis lintas workspace? | `refreshTasks`/`hydrateNotes` sekarang *workspace-scoped*, jadi lintas-workspace butuh jalur baru | ✅ **Dijawab: baca & tulis semua workspace sejak V1** (`#D4`) — ini menambah jalur persist baru dan guard yang harus diuji; lihat §13b |

---

## 12. Konsekuensi keputusan yang menyimpang dari rekomendasi

Tiga jawaban (§11) memilih opsi yang **berbeda dari rekomendasi**. Ketiganya boleh, tapi masing-masing menambah pekerjaan atau risiko yang spesifik. Bagian ini mencatatnya supaya tidak ketemu saat coding.

### 13a. `update_note_body` + `delete_note` di V1 (#D16)

Risiko yang diterima: body note adalah tulisan user, dan delete di StyleNotes **hard delete tanpa tombstone** (the cloud sync design §1 #2) — tidak ada undo. Mitigasi yang **wajib** ikut V1:

1. **Hanya di mode `write`** dengan scope `notes` aktif. `delete_note` **wajib** `confirm: true` — tanpa itu, tolak, karena model bahasa bisa memanggil tool destruktif tanpa maksud destruktif.
2. **Tolak saat ada edit lokal yang belum ter-persist** (guard #D4). Tanpa ini, agent akan menimpa kalimat yang user baru ketik di note window.
3. **Wajib: snapshot pra-ubah.** Sebelum `update_note_body`/`delete_note` dijalankan, tulis body lama ke `mcp/backups/notes/<noteId>-<timestamp>.md` (rotasi: simpan 20 terakhir per note). Ini **bukan** undo di UI, tapi membuat "agent menghapus tulisan saya" bisa dipulihkan dengan membuka file — tanpa itu, satu prompt-injection dari isi note = kehilangan permanen.
4. **Tampilkan di audit** dengan `beforeChars`/`afterChars`, bukan hanya nama tool.
5. **Tegaskan di dialog izin** bahwa membuka scope `notes` berarti agent bisa mengubah dan menghapus isi note.

> Catatan lintas dokumen: saat Pro masuk, `notes.body` menjadi turunan `Y.Doc` (the business model §5). `update_note_body` adalah satu-satunya tool yang **harus ditulis ulang** untuk jalur CRDT — jangan bagun logika body yang diasumsikan permanen. Body adalah teks bebas, jadi jangan percaya asumsi "body selalu markdown valid".

### 13b. Baca & tulis lintas workspace (#D4)

Ini keputusan dengan biaya implementasi paling besar dari kedelapan jawaban, karena **store yang ada tidak dirancang untuk itu**:

- `hydrateTasks`/`refreshTasks`/`refreshDependencies`/`listNotes` semuanya memakai `workspaceStore.activeId`. Menulis ke workspace **non-aktif** lewat store itu = menulis ke workspace yang salah.
- Jalur yang bisa dipakai: repo langsung (`tasksRepo.upsert`, `notesRepo.upsert`, `dependenciesRepo.add`) — **tapi** itu melewati validasi store, jadi validasi (`canAddDependency`, `applyTaskPatch`) harus dipanggil eksplisit sebelum repo.
- **Persist lintas-workspace wajib selalu mengisi `workspaceId` eksplisit.** Repo sudah menerima `workspaceId` (`tasksRepo.upsert` memakai `task.workspaceId ?? 'workspace-default'`) — jadi ini aman **selama agent mengirim workspace yang valid**. Workspace yang tidak dikenal = error `unknown_workspace`, bukan fallback ke `workspace-default`.
- Setelah tulis lintas-workspace, event `tasks:changed`/`notes:changed` tetap di-emit, tapi **UI yang menampilkan workspace lain tidak akan berubah** (memang benar — datanya bukan milik view itu). Workspace aktif tetap harus reload. Ini perlu test eksplisit, karena bug "agent menulis ke workspace X, UI menampilkan workspace Y" terlihat seperti data hilang.
- **Id lintas-workspace tidak unik.** Id seed note (`getting-started`) sama di setiap workspace. Karena itu **semua id dalam respons MCP adalah `"<workspaceId>/<entityId>"`**, dan setiap tool menerima parameter `workspace` opsional; id tanpa prefix diselesaikan ke workspace aktif dengan **error `ambiguous_id`** bila id itu ada di lebih dari satu workspace. Tanpa aturan ini, agent akan "menemukan" note yang salah dan mengubahnya.
- Audit wajib mencatat `workspaceId` di setiap baris.

### 13c. `notes.updated_at` sekarang (#D13)

Menambah kolom ini di luar Fase 0 sync berarti **Fase 0 dan MCP menyentuh tabel `notes` yang sama**, dengan urutan yang tidak dijamin. Aturan yang mengikat:

1. **`ALTER TABLE notes ADD COLUMN updated_at INTEGER`** — nullable, di-backfill `strftime('%s', created_at) * 1000` (sama seperti rencana Fase 0 di the cloud sync design §3.1).
2. **Satu kolom, satu penulis.** `notesRepo.upsert` dan `replaceAll` harus menulis `updated_at` di setiap operasi — kalau tidak, nilai itu hanya berubah saat migrasi dan sorting "baru diubah" langsung bohong.
3. **Fase 0 sync WAJIB menganggap kolom ini sudah ada** dan **tidak** meng-`ALTER` lagi. Ini harus masuk daftar revisi dokumen sync (§10 butir 3), karena `ALTER TABLE ADD COLUMN` yang terduplikasi = migrasi gagal = app tidak start.
4. Kolom display lama `notes.updated` (`"Just now"`, `"Baru saja"`) **tetap** dipakai UI sampai ada pekerjaan terpisah menggantinya dengan derivasi dari `updated_at`. Snapshot MCP **tidak** memakai kolom display itu.
5. `updated_at` ikut di `Note` → `notesRepo` → `persistNote`; ini perubahan tipe yang menyentuh file di luar MCP (lihat §8).

### 13d. Second brain: menutup lubang metadata (#D17)

Snapshot dan tool yang ada cukup untuk **membaca** vault sebagai basis pengetahuan,
tapi tidak untuk **merawatnya**. Tiga lubang yang ditutup:

1. **`update_note_body` hanya menyentuh body.** Metadata note (`title`, `folder`,
   `tags`, `pinned`) sebelumnya hanya bisa di-set sekali, saat `create_note`.
   Akibatnya note yang salah judul, salah folder, atau tanpa tag **tidak akan
   pernah bisa diperbaiki oleh agent** — dan tag adalah sumbu yang dipakai
   `search_notes`/`context` untuk scoring. `update_note` menutup ini dengan
   bentuk yang sama seperti `update_task`: argumen `patch`, key yang tidak
   dikenal diabaikan, dan patch kosong tidak menghapus apa pun.

   Bedanya dari `update_task`: judul note **tidak boleh kosong** (task punya
   `title` wajib, note punya fallback `'Untitled note'`). Patch dengan `title`
   kosong ditolak `bad_arguments`, bukan diam-diam diabaikan, karena
   "berhasil" tanpa perubahan lebih menyesatkan daripada error.

2. **Tidak ada cara menemukan folder atau tag.** `list_notes { folder }`
   mencocokkan **id** folder persis, dan `list_folders` tidak pernah dijawab —
   jadi agent harus menebak. `list_tags` sebelumnya tidak ada sama sekali,
   padahal tag adalah cara utama recall. Keduanya murni agregasi atas snapshot
   yang sudah dikirim, jadi tidak ada jalur baca kedua dan tidak ada query DB
   baru.

3. **`createdAt` selalu 0.** Snapshot meng-hardcode `createdAt: 0`
   (`mcp-snapshot.ts`), sementara `createNote` tidak menerima `createdAt`.
   Akibatnya `list_notes { order: "created" }` — **urutan default** — tidak
   berarti apa-apa, dan agent tidak bisa menyusun timeline. Perbaikan memakai
   kolom `notes.created_at` yang **sudah ada** sejak migrasi 1: tidak ada
   migrasi baru, hanya pembacaan kolom.

Aturan yang mengikat untuk ketiganya:

- **Tidak ada tool baru yang menyentuh DB.** Ketiga tool baru berjalan lewat
  registry yang sama, validasi yang sama, dan event `*-changed` yang sama; tidak
  ada jalur tulis kedua.
- **`list_folders`/`list_tags` adalah scope `workspace`/`notes`.** Keduanya
  menerima `workspace` opsional dan menghitung per `(workspaceId, id)` — folder
  atau tag yang sama di dua workspace adalah dua baris, bukan satu baris
  gabungan, karena kedua workspace memang punya catatan sendiri.
- **`update_note` tidak menulis body.** Ia memakai `notesRepo.upsert` dengan
  `body` yang sudah ada, jadi `excerpt`/`words`/`chars` tetap konsisten dan
  backup pra-ubah (§13a) hanya relevan untuk `update_note_body`.
- **`update_note` juga ditolak saat ada edit lokal tertunda** (`busy_local_edit`),
  lewat guard #D4 yang sama.
- **`created_at` hanya ditulis saat INSERT.** `note_upsert_tx` dan `notesRepo.upsert`
  mengirim `created_at` tapi `ON CONFLICT` **tidak** menyentuhnya; kalau
  ikut di-update, setiap auto-save akan mereset tanggal lahir note itu.
  Backfill untuk baris lama **tidak** ditambahkan: `created_at` sudah terisi
  sejak migrasi 1 (`datetime('now')`), jadi tidak ada baris NULL di produksi.

**Lubang yang sengaja tidak ditutup:** tidak ada `append_to_note`. Pola "tambahkan
baris ke daily note hari ini" tetap harus lewat baca penuh → `update_note_body`,
karena append butuh format pemisah yang tidak boleh ditebak app. Menambah tool
baru untuk itu = menebak struktur user.

### 13e. Edit terarah: hemat token tanpa kehilangan keamanan (#D18)

Kebutuhan nyatanya bukan "append", tapi dua hal yang lebih umum:

1. **Biaya token.** Mengganti satu kata di note 400 baris lewat `update_note_body`
   berarti agent membaca 400 baris lalu mengirim 400 baris kembali — ~800 baris
   token untuk satu perubahan.
2. **Sweep.** "Ganti `alnair` jadi `stylenotes`", "naikkan versi `0.1.0` → `0.2.0`",
   "ganti nama orang" — satu kata, **banyak tempat**.

Keduanya dijawab satu tool, `edit_note_body`, dengan operasi yang **tertutup**:

| `op` | Argumen | Untuk |
|---|---|---|
| `replace` | `find`, `replace`, `occurrence` (`all` default / `once`) | Sweep, koreksi, hapus teks (`replace: ""`) |
| `insert` | `text`, `position` (`start` / `end`) | Menumbuhkan note tanpa membacanya |

**Kenapa `put` tidak ikut.** Ganti seluruh body sudah ada di `update_note_body`.
Menggabungkannya berarti satu payload bisa berarti "kirim 40 KB" atau "kirim 120
byte" tergantung field mana yang terisi — ambiguitas persis yang membuat model
salah panggil. Tiga tool dengan tanggung jawab tunggal lebih mudah diprediksi
daripada satu tool serbaguna: `update_note` (metadata), `edit_note_body`
(terarah), `update_note_body` (ganti total).

**Kenapa `occurrence` default `all`.** Permintaan aslinya hampir selalu
"ganti semua". Agent yang lupa menyalakan `all` akan menghasilkan note dengan
campuran nama lama dan baru — hasil yang terlihat benar padahal tidak, jauh
lebih buruk daripada kelebihan mengganti.

**Jaminan yang tidak bisa dilanggar**, dan alasannya transformasi ini **murni**
(dihitung sebelum ada tulisan apa pun):

- `find` kosong → `bad_arguments`. `replaceAll('')` menyisipkan di antara setiap
  karakter; itu kehilangan data, bukan edit.
- `find` tidak ada di note → `bad_arguments` dengan saran membaca `get_note`.
  Ini yang membunuh bug terburuk: model melaporkan "berhasil" padahal tidak
  mengubah apa pun.
- `occurrence: "once"` tapi `find` ambigu → `bad_arguments`, **bukan** menebak
  kemunculan pertama. Agent harus memberi konteks yang cukup unik; ini memaksa
  ia berpikir dan mencegahnya menyunting tempat yang salah.
- Refusal tidak pernah meninggalkan edit separuh, karena transform dihitung
  lebih dulu di satu tempat (`resolveBodyEdit`).
- `insert` memakai **satu** pemisah milik app (`\n\n`, dinormalkan agar tidak
  menggandakan newline di akhir body). Pemisah dari model akan berbeda antar
  panggilan dan membuat vault tidak konsisten.
- `replace` yang teks penggantinya mengandung `find` tetap aman: implementasinya
  `split`/`join`, bukan loop `indexOf` yang bisa berputar selamanya.
- Backup pra-ubah (§13a) dan `busy_local_edit` (#D4) berlaku sama seperti
  `update_note_body`.

**Verifikasi tanpa membaca ulang.** Respons mengembalikan `matched` dan
`replaced`. Justru inilah sumber penghematannya: agent mengonfirmasi sweep
"7 kemunculan diganti" tanpa `get_note` penuh. Kalau ia tetap harus membaca
ulang, hematnya hilang.

**Struktur file.** Note actions pindah ke `mcp-note-actions.ts` (dan logika murni
ke `mcp-body-edit.ts`) karena `mcp-write-actions.ts` menembus cap 500 baris saat
tool ini ditambahkan. `mcp-write-actions.ts` menyisakan task + dependency dan
me-re-export nama note supaya host dan test tidak perlu berubah.

**Batas yang diakui:** ini tetap pencocokan **teks persis**, bukan regex dan
bukan penggantian case-insensitive. Itu disengaja — regex dari model adalah
permukaan serangan tersendiri (ReDoS, escaping), dan "case-insensitive" membuat
`alnair` cocok dengan `Alnair` di judul yang mungkin memang sengaja dibedakan.
Kalau nanti terbukti perlu, tambahkan `ignoreCase` sebagai flag boolean, bukan
regex.

### 13f. Hari lokal, bukan hari UTC (#D19)

`is_overdue` membandingkan `dueAt` (`YYYY-MM-DD` yang dipilih user) dengan
**prefix 10 karakter `generatedAt`**. Karena `generatedAt` adalah ISO **UTC**,
setiap user di luar UTC mendapat jawaban salah selama sebagian hari:

| Skenario (Jakarta, UTC+7) | Perilaku lama | Benar |
|---|---|---|
| 07:00 lokal, task due hari ini | dibanding `generatedAt` yang masih **kemarin** → **overdue** | tidak overdue |
| 07:00 lokal, task due kemarin | dibanding kemarin → **tidak overdue** | overdue |

Jadi bukan sekadar salah sehari: arah kesalahannya tergantung sisi UTC mana user
berada, dan `overdueOnly` adalah tool yang dipakai agent untuk menjawab "apa yang
telat". Jawaban yang salah di sini lebih buruk daripada tidak menjawab.

**Perbaikan.** Snapshot membawa field baru `today` — tanggal sipil user sebagai
`YYYY-MM-DD`:

- Dihitung app dari `settings.timezone` (preferensi yang **sudah ada**), lewat
  `localToday()` di `stores/settings.svelte.ts`, yang memakai
  `Intl.DateTimeFormat('en-CA')` — format `YYYY-MM-DD` yang persis sama dengan
  bentuk `dueAt`, sehingga perbandingannya tetap **string compare** dan shim
  tidak butuh library tanggal.
- `is_overdue` sekarang membaca `snapshot.today`, bukan `generatedAt`.
- Zona kosong (`''` = ikuti OS) atau nilai yang tidak dikenal runtime →
  fallback ke hari UTC. `timezone` adalah input bebas dari user; nilai buruk
  **tidak boleh** membuat pembacaan gagal, dan test-nya ada
  (`Mars/Olympus_Mons` → hari UTC).
- **`generatedAt` tetap UTC** dan tidak diubah: ia menjawab "kapan snapshot ini
  dibuat", yang memang pertanyaan berbeda.

**`MCP_PROTOCOL` naik ke 2.** Snapshot v1 tidak punya `today`. Shim v2 menolak
app v1 dengan `protocol_mismatch` + pesan "update StyleNotes", bukan diam-diam
kembali membandingkan hari UTC. Gate protokol sudah berjalan **sebelum** dispatch
tool, jadi snapshot lama tidak pernah sampai ke `is_overdue`. Snapshot tanpa
`today` juga dijaga di sisi shim: `is_overdue` mengembalikan `false` alih-alih
menandai semuanya telat (konservatif, seperti sebelumnya).

**Yang ikut berubah perilakunya** (disetujui eksplisit, bukan efek samping):
`overdueOnly` untuk user di luar UTC. Task due hari ini di Jakarta tidak lagi
dianggap telat; task due kemarin di Jakarta akhirnya **dianggap** telat. Test
regresinya eksplisit membandingkan hari Jakarta vs hari UTC pada timestamp yang
sama (`overdue_uses_the_local_day_not_the_utc_day`).

**Yang belum berubah:** `daily_summary` tetap menghitung "recent notes" dari
`updatedAt >= generatedAt - 24 jam`, yang tidak bergantung zona. `list_notes
{ order: "created" }` juga tidak. Tidak ada tool lain yang membandingkan tanggal.

**Konsekuensi untuk journal.** Ini prasyarat yang dimaksud: journal perlu tahu
note mana yang "hari ini", dan tanpa `today` satu-satunya cara adalah menghitung
UTC di shim — kesalahan yang sama, tapi kali ini salah **file**, bukan salah
label.

---

## 13. Keputusan tercatat

| # | Topik | Keputusan | Implikasi |
|---|---|---|---|
| D1 | Bentuk server | **Binary Rust + stdio**, satu proses per client | Tanpa port & tanpa auth; satu binary di `externalBin` |
| D2 | Jalur tulis | **Lewat app**, via file bridge (#D4), **bukan** SQLite langsung | Validasi `canAddDependency`, event lintas window, dan guard ketikan tetap berlaku |
| D3 | Jalur baca | **Snapshot JSON** dari app; shim tidak menyentuh DB untuk baca | Graph/context murah karena parser wiki murni; limit, `truncated` dan `indexOnly` dijaga di app |
| D4 | Ketegasan tulis | Lewat store; tolak note saat edit lokal tertunda; eksekutor **hanya** window `workspace`; **lintas workspace eksplisit (baca + tulis, id ber-prefix workspace)**; timeout 5 s; job atomik; 1 in-flight | Tidak ada jalur tulis kedua yang bisa drift; konsekuensi lintas-workspace di §13b |
| D5 | Siklus hidup | Shim **stateless**; app tertutup → error `app_not_running`; tidak ada fallback spawn/tulis | Hidup berdampingan dengan hide-on-close + tray; rekan multi-client aman |
| D6 | Izin | **Default read-only**; tool write tetap terdaftar tapi menolak dengan `write_not_granted` | Model tidak kebingungan; pesan error mengarahkan user ke Settings |
| D7 | Setting | Tabel `mcp_settings`/`mcp_clients`/`mcp_audit` + master switch `meta:mcp/enabled` | Device-local (tidak ikut sync #24); Rust bisa membaca switch sebelum spawn |
| D8 | Config | Snippet **di-generate** (path absolut + `--instance`); **tidak** menulis config client di V1 | User Free tidak perlu menulis config sendiri; auto-config menyusul setelah ada backup + merge |
| D9 | Registry tool | Satu registry di `mcp-tools.ts` (baca dari snapshot / tulis lewat store) | Handshake, UI Settings, audit, dan **remote MCP nanti** memakai daftar yang sama |
| D10 | Settings | Nav `AI & MCP` → `McpSettings.svelte`, memakai `base/*` dan pola `ui_plugins` | Tidak ada pola baru; `SettingsPanel.svelte` hanya bertambah satu entri |
| D11 | Auth | **Tidak ada auth** untuk stdio; batas kepercayaan = proses lokal | Yang melindungi user: master switch + read-only default + audit |
| D12 | Build | `[[bin]]` + `externalBin`; tanpa dependency Rust baru; migrasi baru (`version: 11`+) | `lib.rs` tetap ramping (supervisor dipisah ke `mcp_host.rs`) |
| D13 | Waktu note | **Kolom `updated_at INTEGER` ditambahkan sekarang** (migrasi sendiri), **tidak menunggu Fase 0 sync**; `list_notes`/`daily_summary`/urutan "baru diubah" memakainya | Migrasi harus **menyentuh kode non-MCP**: `notesRepo` menulis kolom ini di setiap upsert, dan Fase 0 **wajib tidak** menambah kolom `updated_at` lagi (konflik duplicate column). Lihat §13c |
| D14 | Path DB | Tambah perintah Rust **`db_path`** sekarang; nilainya masuk `app-info.json` | Fase 0 sync memakai perintah yang sama; `DB_URL` di 3 tempat tetap, tapi kebenarannya diverifikasi sekali di startup |
| D15 | Capability | Binary MCP **tidak** butuh permission di `capabilities/default.json` (bukan webview, tidak lewat IPC) | Diverifikasi empiris di M1 dengan **build bundle**, karena permission Tauri gagal secara silent. Buka config client otomatis **bukan** scope V1 (#D8) |
| D16 | Scope tool note | V1 **menyertakan** `update_note_body` + `delete_note` (bukan hanya task) | Hanya berjalan di mode `write`; `delete_note` butuh `confirm: true`; keduanya diaudit. Mitigasi & batasnya: §13a |
| D17 | Second brain | **Tambah 3 tool**: `list_folders`, `list_tags` (read) dan `update_note` (write, patch `title`/`folder`/`tags`/`pinned`). Plus kolom `notes.created_at` diisi sungguhan | Tanpa ini agent bisa membuat note tapi tidak pernah bisa merapikannya: tidak ada cara menemukan folder/tag, dan `update_note_body` hanya menyentuh body. Lihat §13d |
| D18 | Edit terarah | **Tambah `edit_note_body`** dengan dua operasi tertutup: `replace { find, replace, occurrence }` dan `insert { text, position }`. Ganti total tetap di `update_note_body` | Motivasi: biaya token. Rename satu kata di note 400 baris tidak boleh butuh kirim 40 KB. Jaminan: `find` kosong / tidak ada / ambigu-dengan-`once` = `bad_arguments`, tidak ada edit separuh. Lihat §13e |
| D19 | Hari lokal | Snapshot membawa **`today`** (`YYYY-MM-DD`) dihitung dari `settings.timezone`. `overdueOnly` membandingkan `dueAt` terhadap `today`, **bukan** prefix UTC `generatedAt`. `MCP_PROTOCOL` naik ke **2** | Perbaikan, bukan kosmetik: sebelumnya task due hari ini salah dinilai untuk semua user di luar UTC. Prasyarat journal. Lihat §13f |
| D20 | Journal | Note per hari lewat kolom **`notes.journal_day`** (#J1) + indeks unik parsial, bukan judul atau tag. Setting journal (4 key) **device-local dulu**. Tool MCP **`journal_today`** | Judul dan tag bisa diubah agent lewat `update_note` (#D17), jadi keduanya tidak bisa menjamin satu note per hari. Kolom juga jadi kunci deteksi konflik saat sync. Desain: `docs/design/archive/journal.md` |
