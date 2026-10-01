# Technical Design — Auto-Save Hardening & Note/Task Versioning

> Status: **Diimplementasikan & diarsipkan** (Phase A + Phase B selesai; lihat §7).
> Tanggal: 2026-09-28 (status diperbarui 2026-10-01)
> Scope: memperkuat jalur auto-save yang sudah ada (`save-queue.svelte.ts`) dan menambahkan riwayat versi lokal untuk note & task.
> Terkait: `cloud-sync-ai-mcp.md` (Fase 0 sync readiness), `collaboration.md` (CRDT `Y.Text`, keputusan C13), `docs/design/archive/mcp-local-free.md` (#D13 `notes.updated_at`, #13a backup body).

Dokumen ini adalah kelanjutan dari review arsitektur. Urutannya sengaja: **Phase A (prasyarat) harus selesai sebelum Phase B**, karena menulis versi di atas SQLite yang belum WAL dan masih rawan `SQLITE_BUSY` hanya memperburuk masalah.

Ringkasan keputusan ada di §6; hal yang butuh keputusan user ada di §7.

---

## 1. Kondisi saat ini (fakta dari kode)

| # | Fakta | Lokasi |
|---|---|---|
| 1 | Editor = native `<textarea>`, model = `body: string` (Markdown polos) | `NoteEditor.svelte`, `content.ts:15` |
| 2 | Command editor = pure functions pada `{value,start,end}` | `markdown-editor.ts`, `markdown-lines.ts`, `markdown-commands.ts` |
| 3 | Auto-save sudah ada: debounce **300 ms**, coalescing, status `saving/failed/dirty`, `flush()` sebelum tutup | `save-queue.svelte.ts` |
| 4 | Dipakai di dua window: `NoteWindow` (`persistNote`) dan `TaskWindow` (`persistTask`) | `NoteWindow.svelte:63`, `TaskWindow.svelte:92` |
| 5 | Setiap write = `INSERT ... ON CONFLICT` **plus** `DELETE FROM tags` + N `INSERT INTO tags` | `db/index.ts:72-78, 100-129` |
| 6 | `notes.updated_at` (INTEGER, epoch ms) sudah ada sejak migrasi 12; `tasks.updated_at` TEXT `datetime('now')` sejak migrasi 4 | `lib.rs` migrasi 4 & 12 |
| 7 | **Tidak ada `journal_mode=WAL` / `busy_timeout` / `synchronous`** di seluruh Rust | grep `PRAGMA` → 0 hasil |
| 8 | Tiap window membuka koneksi SQLite sendiri ke file yang sama (`getDb()` per-window cache) | `db/index.ts:12-22` |
| 9 | Sudah ada pruning file backup keep-N untuk MCP: `backup_note_body` + `prune_backups` | `mcp_host.rs:251-305` |
| 10 | Write mengirim event `notes:changed` / `tasks:changed`; window lain reload hanya jika `!queue.state.dirty` | `notes.ts:21-25`, `NoteWindow.svelte:227-230` |

**Konsekuensi:** menambah versioning tanpa memperbaiki #5, #7, #8 akan menambah write per save di atas jalur yang sudah rawan lock. Itulah alasan Phase A.

---

## 2. Tujuan & non-tujuan

**Tujuan**
- Auto-save tidak pernah kehilangan edit terakhir (termasuk saat window ditutup paksa / app di-quit).
- Tidak ada `SQLITE_BUSY`/data-corruption saat dua window menulis bersamaan.
- Riwayat versi lokal yang bisa direstore, ringan, dan di-prune otomatis.
- Skema versi **kompatibel** dengan roadmap sync/CRDT (tidak dibuang saat Fase 2b).

**Non-tujuan**
- Multi-device sync / konflik antar-device (itu `cloud-sync-ai-mcp.md` Fase 2a, LWW/HLC).
- Real-time collaborative merge (itu `collaboration.md` Fase 2b, Yjs).
- Versioning untuk `folders`, `settings`, `kanbanBoards` (di luar scope; hanya note & task).
- Cloud backup / server apa pun.

---

## 3. Phase A — Hardening persistence (prasyarat)

### A1. SQLite pragmas saat koneksi dibuka

**Masalah.** Default `journal_mode=DELETE`: writer memblokir reader, dan tanpa `busy_timeout` kegagalan langsung `SQLITE_BUSY`. Dengan banyak window menulis file yang sama, ini realistis terjadi.

**Perubahan.** Set pragma sekali per koneksi (di `getDb()` setelah `Database.load`, sebelum query pertama):

```
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
```

**Catatan penting:**
- WAL persisten di file (cukup sekali, tapi idempotent jadi aman dijalankan tiap koneksi).
- `synchronous=NORMAL` + WAL adalah kombinasi aman & standar untuk desktop app (tahan crash app, hanya berisiko pada power loss ekstrem).
- `foreign_keys=ON` mengaktifkan `ON DELETE CASCADE` yang sudah dideklarasikan di skema (`tags.note_id`, dan nanti `note_versions.note_id`) — saat ini cascade **tidak aktif** karena pragma default off. Mengaktifkannya mengubah perilaku delete; perlu dites agar `removeNote` tidak meninggalkan/menghapus baris tak terduga.
- WAL membuat file `-wal` dan `-shm` di sebelah DB. Backup/export DB harus menyertakan keduanya, atau jalankan `PRAGMA wal_checkpoint(TRUNCATE)` sebelum copy.

**Alternatif yang dipertimbangkan:** menyetel pragma via Rust connection hook. Ditolak karena `tauri-plugin-sql` membuka koneksi di sisi frontend dan tidak mengekspos konfigurasi per-koneksi yang stabil di semua versi; menyetel dari `getDb()` adalah cara paling sederhana yang tidak mengubah plugin.

### A2. Save queue dua-tier (idle debounce + minimum write gap)

**Masalah.** Debounce 300 ms berarti mengetik 5 detik berturut-turut = ~16 write DB, masing-masing menulis ulang seluruh body + rewrite tags.

**Perubahan.** Tambahkan parameter kedua `minGap` (default **2500 ms**) ke `createSaveQueue`:

- `enqueue()` tetap me-reset idle timer `delay` (300–500 ms).
- Sebelum `save()`, jika waktu sejak write terakhir **< `minGap`**, jadwalkan ulang sampai `minGap` terpenuhi (jangan tulis dulu).
- `flush()` **selalu** menembus `minGap` (dipakai saat tutup window / pindah note / sebelum MCP menulis).
- Status `dirty` tetap `true` selama ada perubahan yang belum tertulis, sehingga indikator "saving" jujur.

**Hasil:** beban write maksimal ~1 per 2.5 detik per window, bukan ~3 per detik.

**Konsekuensi:** jendela kehilangan data jika app crash bertambah jadi ≤2.5 detik — diterima, dan diimbangi versioning (Phase B) + flush saat close. Kalau dianggap terlalu longgar, `minGap` bisa 1500 ms.

### A3. Perbaikan jalur tulis note

`notesRepo.upsert` melakukan rewrite penuh termasuk tags. Dua perbaikan berurutan (bisa dipisah PR):

1. **Hindari rewrite tags bila tidak berubah.** Bandingkan tags lama vs baru; hanya `DELETE`/`INSERT` saat berbeda. Untuk typing biasa, tags tidak berubah.
2. **Bungkus upsert note + tags dalam satu transaksi** sehingga window lain tidak melihat note tanpa tags di tengah proses. `tauri-plugin-sql` mengekspos `db.execute`; transaksi manual (`BEGIN`/`COMMIT`) perlu diverifikasi di driver, atau gunakan satu statement `INSERT` untuk tags bila memungkinkan.

Butuh verifikasi: apakah `@tauri-apps/plugin-sql` mendukung `BEGIN/COMMIT` multi-statement pada satu koneksi. Jika tidak, alternatifnya memindahkan `upsert` note ke satu Rust command transaksional. **Ini akan saya buktikan sebelum menulis kode** (§7, Q2).

### A4. Guard close/quit

Saat ini `closeWindow()` memanggil `queue.flush()` saat window detail ditutup. Yang belum tertangani:
- Quit app dari tray (`src-tauri/src/tray.rs`) saat masih ada window detail dengan `queue.state.dirty`.
- Window di-hide (`workspace`/`overlay`/`kanban` hide-on-close) tidak mem-flush.

**Perubahan.** Daftarkan handler quit yang meminta semua window detail mem-flush lalu menunggu (dengan timeout, mis. 2 detik) sebelum benar-benar keluar. Detail mekanisme (event dari Rust → frontend → ack, atau `app.exit` setelah ack) ada di implementasi; yang penting: **tidak ada write fire-and-forget yang hilang** (aturan AGENTS.md).

---

## 4. Phase B — Versioning

### B1. Model data

Snapshot penuh (full snapshot), bukan delta. Alasan lengkap ada di review sebelumnya: body adalah string, jadi delta/JSON Patch salah abstraksi, dan CRDT belum waktunya (Fase 2b).

**Skema — migration `version: 14` (baru; jangan edit migrasi lama):**

```sql
CREATE TABLE IF NOT EXISTS entity_versions (
  id         TEXT PRIMARY KEY,
  entity     TEXT NOT NULL,              -- 'note' | 'task'
  entity_id  TEXT NOT NULL,
  payload    TEXT NOT NULL,              -- JSON snapshot field yang di-version
  updated_at INTEGER NOT NULL,           -- epoch ms; selaras notes.updated_at
  reason     TEXT NOT NULL DEFAULT 'auto', -- auto | manual | pre-mcp | close
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entity_versions_lookup
  ON entity_versions (entity, entity_id, updated_at DESC);
```

**Keputusan:** anonim (tanpa FK ke `notes`/`tasks`) supaya task dan note berbagi satu tabel, dan supaya saat pindah ke sync Fase 2a tabel ini **device-local** (tidak di-sync) — mirip keputusan settings device-local di AGENTS.md. Karena tanpa FK, cascade delete harus ditangani manual di `removeNote`/`removeTask` (hapus versi entity tsb), dan itu memang lebih eksplisit.

**Isi `payload`:**
- note → `{"title": string, "body": string, "tags": string[], "folder": string}` (bukan seluruh `Note`, karena `words/chars/excerpt` derived).
- task → JSON dari field yang bisa diedit di `TaskWindow` (`title`, `notes`, `status`, `priority`, `folder`, `noteIds`, `startAt`, `dueAt`).

Payload JSON (bukan kolom terpisah) supaya bentuk versioning note & task seragam, dan saat CRDT datang, payload bisa jadi bahan migrasi ke `crdt_snapshots` tanpa mengubah tabel.

### B2. Kapan versi dibuat (time-gap debounce ala VS Code Local History)

Saat `persist` sukses, evaluasi apakah perlu menulis versi **sebelum** overwrite:

Buat versi baru jika **salah satu**:
- Belum ada versi untuk entity ini, **atau**
- Selisih waktu sejak versi terakhir **> 5 menit**, **atau**
- Perubahan kumulatif sejak versi terakhir **> 40%** dari panjang body sebelumnya, **atau**
- `reason` eksplisit: `close` (window ditutup dengan dirty), `pre-mcp` (agent akan menulis, reuse `backup_note_body`), `manual` (user menekan "Save version").

**Kapan versi disimpan:** versi menyimpan **kondisi sebelum edit** (pre-image), bukan sesudah. Tujuannya restore. Jadi alur: ambil versi terbaru → kalau memenuhi kriteria di atas, tulis versi berisi kondisi **lama** → baru tulis note baru. Jika note belum punya versi sama sekali, versi pertama dibuat dari kondisi sebelum edit pertama.

**Di mana dihitung:** logika murni di `src/lib/stores/versioning.ts` (bisa di-unit-test tanpa DB), DB-nya di `src/lib/db/versions.ts` (`versionsRepo`). Store/`NoteWindow`/`TaskWindow` hanya memanggilnya.

### B3. Retensi / pruning

Model **GFS ringan**, dijalankan setelah insert:

- Semua versi **< 24 jam**: simpan semua.
- Versi **1–7 hari**: simpan 1 per jam (yang terbaru di jam itu), sisanya hapus.
- Versi **> 7 hari**: simpan 1 per hari, sisanya hapus.
- Hard cap **50 versi per entity** — di luar itu hapus yang tertua.
- Skip versi dengan payload > **1 MB** (note sangat besar) agar DB tidak membengkak; catat `reason='skipped'` tidak perlu — cukup tidak menulis.

Implementasi: satu fungsi `pruneVersions(entity, entityId)` yang menghitung id yang dipertahankan. Reuse pola `prune_backups` (sort berdasarkan timestamp, hapus sisanya) tapi versi di SQLite, bukan file.

**Ukuran perkiraan:** note rata-rata 3 KB × 50 versi × N note. Untuk 500 note dengan versi aktif → ~75 MB worst case. Kalau terlalu besar, turunkan cap ke 30 atau aktifkan versioning hanya untuk note yang benar-benar diedit (bukan semua). Lihat §7 Q1.

### B4. UI

- **Tombol History** di dua tempat: `actions` snippet `DetailWindowHeader` (window note/task) **dan** `NoteToolbar.svelte` (editor workspace). Awalnya hanya yang pertama, sehingga di workspace tidak ada entry point.
- Dialog: `src/lib/components/dialogs/RecordHistoryDialog.svelte` (satu komponen untuk note & task), lebar `min(22rem, 100vw-2rem)` dan daftar `max-h-[min(18rem,45vh)]` agar pas di window kecil.
- Daftar versi: waktu relatif (`formatRelative`), label `reason`, preview satu baris.
- Aksi: **Restore** — mengisi ulang record lewat jalur save normal (`update()` note / field form task), sehingga restore itu sendiri ikut di-version.
- Glue note dipakai bersama lewat `src/lib/content/note-versioning.ts` (workspace editor + note window), helper format di `src/lib/content/version-format.ts`.
- `NoteEditor.svelte` dipecah: permukaan editor (write/split/preview + popover) pindah ke `workspace/NoteEditorBody.svelte` agar tetap di bawah hard cap 500 LOC (460 + 127).

### B5. Preferensi

`versioningEnabled: boolean` (default `true`) ditambahkan ke `Settings` (`settings.svelte.ts`), jadi ikut row `settings` yang **synced** (keputusan Q3). Toggle di `SettingsPanel.svelte` seksi editor.

### B6. Implementasi (selesai)

| Bagian | File |
|---|---|
| Migration 15 (`entity_versions`) | `src-tauri/src/lib.rs` |
| Tipe payload | `src/lib/content/version-types.ts` |
| Logika snapshot + retensi (pure, tested) | `src/lib/content/version-retention.ts` |
| Format relatif & preview | `src/lib/content/version-format.ts` |
| Repo | `src/lib/db/versions.ts` |
| Orkestrasi store | `src/lib/stores/versioning.ts` |
| Dialog | `src/lib/components/dialogs/RecordHistoryDialog.svelte` |
| Wiring note/task | `NoteWindow.svelte`, `TaskWindow.svelte` |
| Cleanup saat delete | `notes.ts` (`removeNote`), `tasks.svelte.ts` (`removeTask`) |

**Catatan MCP:** jalur tulis MCP **tidak** menambah versi `pre-mcp` — ia sudah menulis backup body sendiri via `mcp_host::backup_note_body` (#13a). Menambah sistem histori kedua hanya akan menduplikasi intent; dibiarkan begitu.

**Verifikasi:** `bun run check:all` hijau; `bun run test` **647** lulus (+17 tes baru).

---

## 5. Alur ringkas

```
user ketik
  └─ update(patch) → applyNotePatch → note = next → queue.enqueue(next)
        └─ idle 300ms → cek minGap 2500ms
              └─ flush()
                   ├─ versioning.maybeSnapshot(preImage)   [Phase B]
                   │     └─ versionsRepo.insert + pruneVersions
                   ├─ notesRepo.upsert (tx)                 [Phase A3]
                   └─ emit notes:changed
```

Urutan **versi dulu, baru note** penting: kalau write note gagal, versi pre-image tetap ada (tidak apa-apa, hanya versi ekstra). Kalau versi gagal ditulis, note tetap tersimpan seperti perilaku sekarang.

---

## 6. Ringkasan keputusan

| # | Keputusan | Alasan |
|---|---|---|
| A1 | WAL + `busy_timeout=5000` + `synchronous=NORMAL` (+ `foreign_keys=ON`) | Cegah `SQLITE_BUSY` multi-window; WAL sudah standar desktop |
| A2 | Save queue dua-tier: idle 300–500 ms + min gap 2500 ms | Batasi write DB saat mengetik cepat |
| A3 | Rust command transaksional untuk upsert note+tags; skip rewrite tags bila tidak berubah | Verifikasi Q2: plugin pakai sqlx pool per-statement → transaksi frontend tidak aman |
| A4 | Flush semua window dirty sebelum quit dari tray | Tidak ada edit hilang |
| B1 | Satu tabel `entity_versions` (note & task), payload JSON, tanpa FK, device-local | Seragam, kompatibel sync/CRDT |
| B2 | Full snapshot pre-image, time-gap 5 menit / 40% / reason | Ala VS Code Local History; murah & mudah diuji |
| B3 | Retensi GFS: 24 jam penuh → 1/jam (7 hari) → 1/hari, cap 50 | Batasi pertumbuhan DB |
| B4 | UI History + Restore untuk **note dan task** | Konsisten, reversibel |
| B5 | Flag `versioningEnabled` di `Settings` (**synced**) | Bisa dimatikan user |
| — | **Bukan** JSON Patch (RFC 6902) | Body string; tidak menyelesaikan konflik |
| — | **Bukan** CRDT/event sourcing sekarang | Relevan Fase 2b (Yjs `Y.Text`); skema dibuat kompatibel |
| — | **Dua PR**: Phase A lalu Phase B | A bermanfaat mandiri, mudah di-revert |

---

## 7. Keputusan final (diputuskan 2026-09-28)

1. **Cakupan versioning:** **note + task**, cap **50 versi/entity**, skip payload >1 MB. (Q1)
2. **Transaksi upsert: DIPUTUSKAN → satu Rust command transaksional.** Verifikasi selesai (lihat §7.1): `@tauri-apps/plugin-sql` 2.4.1 memakai sqlx `Pool<Sqlite>` dan memanggil `pool.execute(...)`, sehingga setiap `db.execute()` mengakuisisi koneksi yang **bisa berbeda**. `BEGIN`/`COMMIT` dari frontend **tidak aman** dan dilarang. Fallback yang dipilih: pindahkan "upsert note + rewrite tags" ke satu `#[tauri::command]` yang menjalankan `sqlx` transaction di satu koneksi. Verifikasi adalah langkah pertama Phase A ✅ **selesai**.
3. **Flag versioning:** **synced** — ikut row `settings`. (Q3)
4. **Pengiriman:** **dua PR terpisah**, Phase A (hardening) dulu, Phase B (versioning) menyusul. (Q4)
5. **`foreign_keys=ON`:** **ya**, disertai **tes regresi** untuk `removeNote`/`removeTask`/`clearNotes` karena cascade baru aktif. (Q5)
6. **`minGap`:** **2500 ms** di atas idle debounce 300 ms. (Q6)
7. **UI History:** **note dan task dua-duanya** punya tombol/dialog History. (Q7)

### Urutan kerja Phase A

1. Q2 — ✅ **selesai**: plugin memakai sqlx pool per-statement; transaksi frontend tidak aman → Rust command.
2. A1 — ✅ **selesai**: pragmas di `getDb()` (`WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON`) + tes regresi delete.
3. A2 — ✅ **selesai**: `save-queue` dua-tier (`delay` 300 + `minGap` 2500); write pertama sesi tidak ditunda.
4. A3 — ✅ **selesai**: `src-tauri/src/db_tx.rs` (pool sqlx sendiri, `max_connections(1)`) dengan `note_upsert_tx` + `note_remove_tx`; frontend memakai invoker dengan fallback ke jalur lama. Optimasi skip-rewrite tags juga diterapkan di kedua jalur.
5. A4 — ✅ **selesai**: `src-tauri/src/quit.rs` + `src/lib/stores/quit-flush.ts`; tray "Quit" meminta flush, menunggu ack 2 detik, lalu keluar.

**Verifikasi:** `bun run check:all` hijau (svelte-check 0/0, fmt ok, clippy `-D warnings` ok); `bun run test` 630 lulus.

### 7.1 Detail verifikasi Q2 (bukti)

- `src-tauri/Cargo.toml`: `tauri-plugin-sql = { version = "2.4.1", features = ["sqlite"] }`.
- `wrapper.rs:27` → `DbPool::Sqlite(Pool<Sqlite>)`; `wrapper.rs:91` → `Pool::connect(...)`.
- `wrapper.rs:166` → `pool.execute(query)` — **`Pool::execute` mengakuisisi koneksi dari pool per statement**, bukan connection-bound.
- `commands.rs:63-66` → command `execute` hanya meneruskan ke `db.execute` di atas; tidak ada state transaksi lintas-panggilan.
- **Konsekuensi:** `await db.execute('BEGIN')` lalu `... 'COMMIT'` bisa berjalan di koneksi berbeda → error atau no-op yang menyesatkan. Dilarang.
- **Kesimpulan:** atomisitas note+tags harus lewat Rust command (`sqlx::Transaction` di satu `pool.acquire()`), diregister di `generate_handler!`, dengan permission bila perlu di `capabilities/default.json`.
