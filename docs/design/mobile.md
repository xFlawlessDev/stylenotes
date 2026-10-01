# System Design — Mobile App (Shared Brain, Separate Shell)

> Status: **Design decided — 15 keputusan tercatat (#M1–#M15), 0 pertanyaan terbuka.**
> Tanggal: 2026-09-29
> Scope: bagaimana StyleNotes mendapat **mobile app** (Android + iOS) tanpa mem-fork logika inti.
> Dokumen terkait:
> - `docs/design/cloud-sync-ai-mcp.md` — sync delta, auth, AI, MCP (#1–#27). Fase 6 dokumen itu ("Mobile / web — pakai `shared/` yang sama") **direvisi di sini menjadi lebih konkret** (§8).
> - `docs/design/collaboration.md` — org/permission/CRDT (#C1–#C16). Menentukan apakah mobile ikut mode CRDT.
> - `docs/design/archive/mcp-local-free.md` — local MCP (#D1–#D16). **Tidak ikut ke mobile** (#M7).
> - `docs/design/business-model.md` — open core, Plus/Pro (#B1–#B13). Menentukan tier fitur mobile.

---

## 0. Ringkasan eksekutif

StyleNotes desktop adalah aplikasi lokal-first dengan ~40.600 LOC TS/Svelte (17.200 di antaranya TS non-test) dan **189 komponen** yang sangat *desktop-shaped*: multi-window (`workspace`, `overlay`, `kanban`, `note-*`, `task-*`), overlay dock click-through, kanban terkunci ke desktop, tray, global shortcut, drag-drop file.

Pertanyaan yang dijawab dokumen ini: **apakah mobile memakai `src/` yang sama?**

**Jawaban: tidak.** Yang di-share adalah **otak** (`content/`, `db/`, `i18n/` — ~7.500 LOC yang sudah terbukti portable), bukan **shell** (komponen). Tiga alasan mengikat:

1. **125 titik guard `isTauri`/`browser`** akan berubah dari jembatan menjadi percabangan permanen di setiap perubahan UI.
2. **Multi-window adalah arsitektur, bukan detail UI.** `note-*`/`task-*`, overlay click-through, kanban desktop-underlay, dan tray tidak punya padanan mobile; memaksanya lewat satu komponen menghasilkan abstraksi palsu (#M4).
3. **Interaction model berbeda fundamental**: hover, context-menu, DnD pointer, shortcut → gesture, bottom-sheet, `safe-area-inset`.

Prinsip pembentuk desain:

> **Ekstrak karena sudah terbukti portable, bukan karena "biar bisa mobile".**
> `content/` tidak mengimpor satu pun komponen; `db/` dan `i18n/` sudah berdiri sendiri. Yang di-share ditentukan oleh dependency nyata di kode, bukan ambisi lintas platform.

Konsekuensi:

1. **Monorepo bertahap.** `content/` + `db/` + `i18n/` + `shared/` (rencana sync) + `api/` masuk ke `packages/*`. `src/` **tidak dipindah dulu** — memindahkannya menambah risiko tanpa manfaat selagi hanya ada satu app (merevisi `cloud-sync-ai-mcp.md` §10). Lihat #M2.
2. **Mobile adalah app kedua yang tipis.** Fase pertama hanya notes + editor + tasks list. Kanban/graph/gantt/overlay **tidak** ikut MVP (#M6).
3. **Mobile butuh sync lebih dulu.** Tanpa sync, mobile adalah pulau data. Urutannya: Fase 0 sync readiness → Fase 2 sync engine → **baru** Fase 6 mobile (#M5).

---

## 1. Kondisi saat ini (temuan yang menentukan desain)

Dibaca dari `src/lib/**`, `src-tauri/tauri.conf.json`, `package.json`, `vite.config.js`, serta `cloud-sync-ai-mcp.md` §10–§13 dan `mcp-local-free.md`.

| # | Temuan (terverifikasi) | Implikasi ke mobile |
|---|---|---|
| 1 | **`content/` hampir tidak bergantung UI.** `content.ts` hanya impor `version-format`; `workspace-graph.ts` impor tipe dari `stores/notes` + `stores/tasks` — dua file yang **tidak** impor `@tauri-apps/*`. | `content/` bisa di-share dengan **satu** refactor kecil (#M3): pindahkan tipe domain ke `packages/core/domain/`. |
| 2 | **`stores/*.svelte.ts` mengimpor `@tauri-apps/api/event` + `$lib/windows`** (`notes.ts` baris 2–3 & 14, `tasks.svelte.ts`, `settings.svelte.ts`, `ui-plugins.svelte.ts`). | Semua store adalah **host, bukan core**. Mobile butuh store sendiri atau lapisan `platform/` (#M-Q1). |
| 3 | **`db/index.ts` mengimpor `@tauri-apps/plugin-sql` + `@tauri-apps/api/core` (`invoke`)** dan memakai API `db.select`/`db.execute`. | Repo **portable secara bentuk**; mobile Tauri memakai plugin yang sama → kemungkinan besar cukup shim `invoke`. |
| 4 | **`i18n/` berdiri sendiri** — hanya `index.svelte.ts` yang menyentuh `document`/`localStorage` (mirror pre-paint); `locales/**` murni. | `locales/` + `catalog.ts` + `format.ts` **langsung shareable**; `index.svelte.ts` tetap per-app. |
| 5 | **`notes.updated` adalah string display** (`"Just now"`); `notes.updated_at INTEGER` ada (migrasi 12), sedangkan `tasks.updated_at` masih TEXT dan **menunggu rebuild** di Fase 0 sync. | Mobile **tidak boleh** membangun skema lokalnya sebelum Fase 0 selesai, atau lahir dua bentuk skema (#M8). |
| 6 | **Multi-window adalah arsitektur**: `tauri.conf.json` mendeklarasikan `workspace`/`overlay`/`kanban`; `note-*`/`task-*` dibuat runtime; `windows.ts` + `+page.svelte` branch per role. | Di mobile tidak ada window kedua. "Buka note di window baru" jadi **navigasi dalam satu webview**. Ini rewrite shell, bukan port. |
| 7 | **`overlay` always-on-top, transparan, click-through** (`set_ignore_cursor_events`); `kanban` pakai `tauri-plugin-desktop-underlay`. | Tidak ada padanannya di Android/iOS. Dibuang, bukan diabstraksi. |
| 8 | **Global shortcut + tray** (`lib.rs`, `plugin-global-shortcut`, `tray-icon`). | Diganti share-sheet / home-screen widget (opsional, di luar MVP). |
| 9 | **Local MCP = stdio + spawn proses + file bridge** (`mcp-local-free.md` #D2/#D5/#D11). | **Tidak mungkin di iOS, tidak layak di Android.** MCP tidak ikut (#M7). |
| 10 | **AI stack Rust (`src-tauri/src/ai/`)**: AES-GCM + `ai/secrets.key` + Channel streaming, network ke provider BYOK. | AI **bisa** ikut mobile (tanpa MCP). `web.rs` (SSRF guard + HTML→text) perlu ditinjau untuk mobile (#M-Q3). |
| 11 | **`vite.config.js`**: `strictPort: 1420`, `resolve.conditions: ["browser"]`, Vitest `environment: jsdom`. | Mobile tidak bisa memakai port 1420 bersama desktop di satu mesin dev; butuh config Vite sendiri. |
| 12 | **`markdown-preview.ts` / `mermaid-*.ts` membangun DOM** (`document.createElement`, `mermaid`, `shiki`, `katex`) dengan `DOMPurify`. | Ini **tetap jalan** di mobile — syaratnya **mobile harus WebView** (#M1). Kalau native UI, seluruh nilai `content/` hilang. |
| 13 | **LOC budget** target ≤300 / cap 500; `components/ui/**` exempt. `package.json` **tidak** punya `workspaces`. | Menambah `apps/` + `packages/` butuh `package.json` root `workspaces` + perluasan gate (#M9). |

**Kesimpulan:** mobile bukan "build target baru untuk `src/`", melainkan **app kedua** yang memakai paket bersama. Yang menghalangi reuse bukan framework, melainkan **shell desktop yang menyatu dengan arsitektur**.

---

## 2. Arsitektur target

```
stylenotes/                              (bun workspaces — bertahap, #M2)
├─ packages/
│  ├─ core/          @stylenotes/core     ← src/lib/content + tipe domain (#M3)
│  ├─ db/            @stylenotes/db       ← src/lib/db (repo + definisi migrasi)
│  ├─ i18n/          @stylenotes/i18n     ← locales/ + catalog + format
│  ├─ ui/            @stylenotes/ui       ← components/base/** + token layout.css
│  └─ shared/        @stylenotes/shared   ← kontrak sync (cloud-sync §10)
├─ src/ + src-tauri/                      ← desktop (tetap di root, #M2)
├─ api/                                   ← ElysiaJS + Bun (cloud-sync §10)
└─ apps/mobile/                           ← app kedua (Tauri v2 mobile)
   ├─ src/            ← shell: routes, bottom-nav, sheet, gesture
   └─ src-tauri/      ← target android/ios, capability mobile
```

Dependency yang harus dijaga:

```
apps/mobile ──► @stylenotes/core ──► @stylenotes/shared
     │                ▲
     ├──► @stylenotes/db ─┘
     ├──► @stylenotes/i18n
     └──► @stylenotes/ui

desktop (src/) ──► semua packages (alias `$lib/...` dipertahankan sementara)
```

**Aturan mati (#M12):** `packages/*` **tidak boleh** mengimpor `$lib`, `$app/*`, atau `@tauri-apps/*` — pengecualian tunggal `packages/db` (`plugin-sql` sebagai peer). Kalau sebuah modul butuh itu, ia bukan bagian core.

| Komponen | Teknologi | Tanggung jawab |
|---|---|---|
| `packages/core` | TS murni + markdown-it/mermaid/shiki/katex/dompurify | Parsing/format/render markdown, wiki-link, graph build, version retention |
| `packages/db` | TS + `plugin-sql` (peer) | Repo (`notesRepo`, `tasksRepo`, …) + migrasi SQL sebagai data |
| `packages/i18n` | TS + `locales/**` | `Messages`, `t`/`tFor` pure, `format`, `catalog` |
| `packages/ui` | Svelte 5 + Tailwind v4 | `base/` primitives + token, sadar safe-area & touch target |
| `apps/mobile` | Tauri v2 mobile + SvelteKit SPA | Shell: bottom-nav, sheet, gesture, satu webview |
| Rust | Tauri v2 | Crate sama; `ai/` ikut, `mcp/` + tray + underlay tidak |

---

## 3. Batas share vs split

### 3.1 Di-share (`packages/*`)

| Item | Alasan |
|---|---|
| `content/*` (markdown, wiki, graph, version, preview, mermaid) | Nol impor UI/Tauri; sudah diuji dengan Vitest |
| `db/*` repo + **definisi migrasi SQL** | Skema harus **identik** antar platform atau sync rusak (#M8) |
| `i18n/locales/**`, `catalog.ts`, `format.ts` | Murni; `en` tetap schema, `id` tetap typed |
| `components/base/**` + token `layout.css` | Primitif presentational; satu-satunya sumber tombol/input |
| `shared/*` (protokol sync, HLC, TypeBox) | Sudah dirancang lintas platform (`cloud-sync-ai-mcp.md` #5) |
| Tipe domain `Note`/`Task`/`TaskDependency`/`CustomFolder`/`Workspace`/`AppNotification` | Sekarang tersebar di `stores/*`; dipindah ke `core/domain/` (#M3) |
| Fungsi murni `stores/notes.ts` & `stores/tasks.ts` (tanpa rune/emit) | `canAddDependency`, `isTaskBlocked`, normalisasi, `taskNoteIds` |

### 3.2 Tetap di `src/` (desktop)

| Item | Alasan |
|---|---|
| `components/workspace/**`, `overlay/**`, `dialogs/**`, `graph/**` | Desktop-shaped, sebagian besar non-touch |
| `components/tasks/**` (Kanban, Gantt, Dashboard, Dependency*) | Layout lebar; di luar MVP mobile |
| `stores/kanban.svelte.ts`, `stores/dock.svelte.ts`, `windows.ts` | Terikat plugin desktop (underlay, click-through, multi-window) |
| `TitleBar`, `CommandPalette`, `FileDropZone`, `QuickCaptureMenu` | Shortcut/hover/OS-level |
| `NoteWindow` / `TaskWindow` | Multi-window spesifik |
| **Shell** store per platform (`*.svelte.ts`: state rune, `emit`/`listen`, orkestrasi persist) | Host; thunk murni ikut `packages/core/state` (#M13) |

### 3.3 Dibuang di mobile (bukan diabstraksi)

`overlay` (always-on-top/transparan/click-through) · `kanban` desktop-underlay · tray · hide-on-close · global shortcut · **local MCP (stdio)** · drag-drop OS.

### 3.4 Matriks fitur desktop vs mobile

| Kapabilitas | Desktop | Mobile MVP | Catatan |
|---|---|---|---|
| Notes list + search + folder + tag | ✅ | ✅ | Inti |
| Editor markdown + preview | ✅ | ✅ (write/preview toggle) | Split view tidak masuk akal di layar sempit |
| Wiki links + backlink | ✅ | ✅ | `content/wiki-*` dipakai utuh |
| Tasks: list + detail + status + due | ✅ | ✅ | |
| Tasks: Kanban DnD / Gantt / Dashboard | ✅ | ❌ (fase 2 mobile) | Butuh gesture DnD sendiri; jangan di MVP |
| Graph view | ✅ | ❌ | Terlalu padat + berat |
| Overlay dock / quick capture global | ✅ | ❌ (share-sheet, opsional) | |
| Multi-window note detail | ✅ | ❌ → navigasi push | Direktif shell |
| Version history | ✅ | ✅ read-only | `db/versions.ts` ikut |
| Attachment / image paste | ✅ | ⚠️ share-sheet import | `attachments.ts` murni; path FS berbeda |
| AI assistant | ✅ | ✅ **penuh di v1** | #M15 |
| Local MCP | ✅ | ❌ | #M7 |

---

## 4. Keputusan tercatat

| # | Topik | Keputusan | Implikasi |
|---|---|---|---|
| **M1** | **Teknologi shell mobile** | **Tauri v2 mobile (WebView)**, bukan native UI dan bukan React Native | Satu-satunya pilihan yang membuat `content/` (markdown+mermaid+shiki+DOM) tetap bernilai. Konsekuensi: perf scroll harus dijaga |
| **M2** | **Struktur repo** | **Bertahap**: tambah `packages/*` sekarang; `src/` tetap di root; `apps/mobile/` menyusul. Pindah `src/`→`apps/desktop` **ditunda** sampai app kedua hidup | Merevisi `cloud-sync-ai-mcp.md` §10: opsi `apps/*` yang dulu ditolak, kini **diterima sebagian dan ditunda** (§8) |
| **M3** | **Isi `packages/core`** | `src/lib/content/**` dipindah apa adanya **plus** tipe domain dari `stores/notes` & `stores/tasks`; refactor impor `workspace-graph.ts` | Satu-satunya refactor wajib. Tanpa ini `core` akan mengimpor store dan menyeret rune+tauri |
| **M4** | **Satu `src` atau dua shell** | **Dua shell.** Share lewat packages, bukan lewat `if (mobile)` | Menolak "responsive single codebase": 125 guard akan jadi percabangan permanen |
| **M5** | **Urutan** | **Sync dulu, mobile kemudian.** Mobile = **Fase 6**, tidak mulai sebelum Fase 0 & 2 sync selesai | Mobile tanpa sync = pulau; juga mencegah skema lokal kedua lahir sebelum `updated_at INTEGER`/tombstone stabil |
| **M6** | **Scope MVP mobile** | Notes (list/editor/wiki/search/folder/tag/version read) + Tasks list/detail + **AI penuh**. **Tidak ada** Kanban/Gantt/Graph/overlay | Menjaga app kedua tipis; kalau Kanban ikut, cap LOC jebol cepat |
| **M7** | **MCP di mobile** | **Tidak ikut.** MCP tetap desktop-only | stdio+spawn+file bridge tidak ada di iOS. Tidak ada percabangan di `mcp/` |
| **M8** | **DB & migrasi mobile** | **Skema identik** desktop; definisi migrasi sebagai data di `packages/db`, dijalankan tiap platform | Kalau skema bercabang, sync rusak senyap. Alasan `db/` masuk packages lebih awal |
| **M9** | **Quality gate** | `check:all` diperluas: typecheck `packages/*` + `apps/mobile`; Vitest mencakup `packages/**/*.test.ts`. Cap 300/500 berlaku untuk `apps/mobile` | Tanpa ini paket bersama jadi tempat sampah tak teruji |
| **M10** | **UI mobile** | `packages/ui` hanya primitif; **layout** mobile ditulis di `apps/mobile` | Mencegah `packages/ui` tumbuh jadi komponen desktop yang di-`if`-kan |
| **M11** | **Auth mobile** | Callback loopback/deep-link versi mobile (bukan jalur desktop); token di **secure storage OS** | `cloud-sync-ai-mcp.md` #4 & §13 **diterapkan ulang**, bukan di-copy |
| **M12** | **Boundary paket** | Prefix `@stylenotes/*`; larangan impor `$lib`/`$app`/`@tauri-apps` kecuali `packages/db` | Satu aturan yang menjaga batas tetap nyata |
| **M13** | **Store mobile** | **Core + host + thunk** (pilihan a). Fungsi murni dipindah ke `packages/core/state/` dalam bentuk **thunk** (`(id, value, ctx) => state`) yang **mengembalikan state berikutnya + daftar efek**; efek (`write`, `emit`, `notify`, `refresh`) dieksekusi shell platform | Menolak (b): `canAddDependency`, `isTaskBlocked`, normalisasi note-id, rollback, coalescing `save-queue` akan ter-duplikasi di dua app. Menolak (c): `emit`/`listen`/`getCurrentWindow` tidak ada di mobile, memaksa percabangan di store |
| **M14** | **Sync engine** | **Satu engine TS di `packages/sync`**, dipakai desktop & mobile (pilihan a). **Window `sync` tersembunyi dihapus** → merevisi `cloud-sync-ai-mcp.md` #3 | Engine yang sama = satu perilaku konflik. Pembungkus host dipisah: desktop menjalankannya di window `workspace` (yang sudah selalu hidup), mobile di app foreground. **Tidak** memakai background task Rust (pilihan b) — mengunci logika sync ke Rust berarti jalur logika ganda. Menolak (c) karena itu bukan alternatif dari (a)/(b), melainkan kebijakan penjadwalan yang dipakai di kedua platform |
| **M15** | **AI di mobile** | **Ya, penuh di v1** (chat + read tools + write tools dengan grant). Grant di mobile adalah **Allow/Decline inline per write**, sama seperti desktop (tidak ada halaman Settings yang setara di MVP) | `src-tauri/src/ai/` + `web.rs` ikut ke target mobile; UI chat mobile ditulis ulang tipis di `apps/mobile`; `ask_user_question` memakai komponen kartu inline milik mobile. **Tidak butuh** `capabilities` desktop — kanal IPC + command yang sama |

### Konsekuensi lintas keputusan

- **M1 + M4**: WebView (M1) adalah prasyarat dua-shell (M4). Pindah ke native UI nanti = tulis ulang render `content/` → keputusan ini mahal dibatalkan. Sadari.
- **M2 + M5**: `apps/mobile` **tidak** dibuat sekarang; yang dikerjakan `packages/core`/`db`/`i18n` + `shared/`, yang berguna juga untuk `api/`.
- **M3 + M8**: `packages/db` butuh dua hal: (a) daftar migrasi sebagai **data**, (b) repo. Desktop menjalankan migrasi dari `src-tauri/src/lib.rs`; mobile menjalankannya dari sisi TS/plugin. **Daftar migrasi harus punya satu sumber** (Rust membacanya, atau keduanya di-generate). Ini pekerjaan nyata, bukan detail.
- **M7 + M11**: tanpa MCP di mobile, tidak ada OAuth MCP di sana — satu jalur auth saja (Better Auth + OS storage).
- **M13 + M14 + M15**: ketiganya menuju arah yang sama — **logika turun ke `packages/*`, shell host menipis**. Engine sync dan store state menjadi milik core; desktop kehilangan window `sync` tapi tidak kehilangan kemampuan. Ini juga alasan `packages/sync` harus dibuat **sebelum** `apps/mobile`, bukan bersamanya.
- **M13 + M14**: thunk (`M13`) dan engine sync (`M14`) sama-sama mengubah state lewat fungsi murni, jadi keduanya wajib berbagi tipe state yang sama di `packages/core`. Jangan biarkan engine sync punya salinan `Note`/`Task` sendiri.
- **M14 + #M5**: karena window `sync` dihapus, Fase 2 sync di `cloud-sync-ai-mcp.md` §11 **berubah bentuk** — engine lahir sebagai paket TS, bukan window. Ini mempercepat M-1 (§6) dan menghapus satu permission/capability entry.
- **M15 + M6**: AI masuk MVP berarti `apps/mobile` tidak sesempit yang terlihat; perkirakan UI chat + komponen kartu inline sebagai bagian M-2/M-4, bukan M-5.
- **M15 + M11**: write tool di mobile memakai grant yang sama (`ai_settings.access`/`scopes`), tetapi penegakannya di layar HP adalah kartu inline — tidak ada percabangan logika, hanya percabangan presentasi.

---

## 5. Keputusan yang menutup pertanyaan terbuka (closed 2026-09-29)

Ketiga pertanyaan sebelumnya sudah dijawab dan di-fold ke #M13–#M15 di atas. Ringkasannya:

| Dulu | Jawaban | Keputusan | Alasan utama |
|---|---|---|---|
| Store mobile: tulis ulang atau ekstrak? | **Ekstrak (core + host + thunk)** | #M13 | Logika bisnis (dependency, rollback, coalescing) tidak boleh punya dua versi; `emit`/`listen` tidak portabel |
| Sync engine hidup di mana? | **`packages/sync`, window `sync` dihapus** | #M14 | Satu engine = satu perilaku konflik; desktop memakai window `workspace`, mobile memakai foreground |
| AI ikut mobile v1? | **Ya, penuh** | #M15 | `ai/` sudah cross-platform; MCP-lah yang tidak portabel, bukan AI |

**Konsekuensi yang tidak bisa ditawar dari jawaban ini:**

1. **`packages/sync` menjadi prasyarat mutlak.** Engine ini harus selesai dan dipakai desktop **sebelum** `apps/mobile` dibangun. Kalau tidak, mobile akan memaksa engine kedua.
2. **`cloud-sync-ai-mcp.md` #3 dan §11 harus direvisi** (window `sync` → paket TS). Itu perubahan keputusan, bukan catatan implementasi.
3. **`packages/core/state` harus mendahului `packages/sync`**, karena engine sync menulis lewat thunk yang sama dengan UI.
4. **`ai_settings` device-local tetap device-local.** Grant AI di HP berbeda dari grant di desktop — jangan pernah menyinkronkan `ai_settings` sebagai efek samping sync, karena itu keputusan keamanan, bukan preferensi.

---

## 6. Roadmap (mengikuti fase sync)

| Fase | Isi | Hasil yang bisa diuji |
|---|---|---|
| **M-0 — Ekstraksi paket** *(bisa jalan sekarang, tanpa sync)* | `package.json` root dapat `workspaces`; buat `packages/core`, `packages/i18n`, `packages/db`; pindah file apa adanya; `db/` ekspor daftar migrasi sebagai data; perluas `check:all` + pola Vitest; tipe domain ke `core/domain/`; **mulai `core/state` (thunk murni, #M13)** | `bun run check`, `test`, `clippy` tetap hijau; desktop tidak berubah perilaku |
| **M-1 — Sync Fase 0+2, engine jadi paket** *(prasyarat, dari `cloud-sync-ai-mcp.md`)* | `updated_at INTEGER` (termasuk rebuild `tasks`), tombstone, outbox; **engine TS di `packages/sync` (#M14) — bukan window `sync`**; desktop memakainya dari window `workspace` | Uji 2 device konsisten; window `sync` tidak ada lagi |
| **M-2 — Skeleton mobile** | `apps/mobile` + Tauri v2 mobile init, `capabilities` mobile, bottom-nav, notes list dari `packages/db`, editor write lokal lewat thunk | App jalan di emulator, data lokal, tanpa akun |
| **M-3 — Sync di mobile** | Engine `packages/sync` dijalankan di foreground; login (callback mobile) + pull/push; konflik LWW | Note dibuat di HP muncul di desktop |
| **M-4 — Paritas inti** | Wiki link + backlink, search, folder/tag, tasks list/detail, version read-only, share-sheet import, **AI penuh (#M15)**: chat + kartu Allow/Decline + kartu pertanyaan inline | Paritas fungsional dengan MVP (#M6) |
| **M-5 — Opsional** | Widget quick capture, Kanban mobile, layout tablet | Fitur di luar inti |

---

## 7. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Shell mobile menyusup ke `packages/ui`** | Paket bersama jadi komponen bercabang, tujuan monorepo hilang | #M10 + #M12 ditegakkan di review; `packages/ui` hanya primitif |
| **Migrasi bercabang** (Rust vs TS) | Sync rusak senyap, data tidak konsisten | #M8: satu sumber daftar migrasi; test yang menjalankan daftar yang sama di kedua host |
| **Store duplication drift** | Logika `canAddDependency`/rollback berbeda di HP → bug yang sulit dilacak | Sudah ditutup: #M13 mewajibkan thunk murni di core, shell hanya mengeksekusi efek |
| **Engine sync kedua lahir di mobile** | Dua perilaku konflik berbeda = data rusak, dan tidak ada yang bisa mereproduksi bug | #M14 (satu engine di `packages/sync`) + gate #M5: `apps/mobile` tidak dibangun sebelum engine dipakai desktop |
| **Percabangan AI di dua shell** | `ai_settings`/grant berbeda perilaku → lubang keamanan halus | #M15: logika di Rust + `content/ai-*`; UI chat per platform, **grant tetap device-local dan tidak di-sync** |
| **Keputusan mobile dipaksa terlalu awal** | `apps/mobile` dibangun sebelum sync → rework besar | #M5: gate fase |
| **WebView performance** (mermaid/shiki pada dokumen besar) | Scroll tersendat di device kelas menengah | Lazy-render preview (sudah dipisah `preview-*`), debounce, batasi mermaid di mobile |
| **iOS tidak punya sidecar/MCP** | Fitur yang dijual di desktop tidak ada di HP | Sudah diputuskan (#M7); komunikasikan di tier/roadmap |

---

## 8. Konsekuensi ke dokumen lain

| Dokumen | Perubahan yang dibutuhkan |
|---|---|
| `cloud-sync-ai-mcp.md` §10 | Catatan "opsi `apps/*` ditolak" **direvisi sebagian**: `packages/*` diterima sekarang, `apps/desktop` ditunda (#M2); tambahkan `packages/sync` + `packages/core/state` ke daftar workspace. Tambahkan tautan ke dokumen ini. |
| `cloud-sync-ai-mcp.md` §11 Fase 6 | "Mobile / web" **diganti** dengan fase nyata M-0..M-5 (§6) + gate #M5. Fase 2 juga berubah: engine sync lahir sebagai paket TS, bukan window. |
| `cloud-sync-ai-mcp.md` **#3 (window `sync`)** | **DIREVISI (diputuskan #M14)**: engine pindah ke `packages/sync`; **window `sync` dihapus** — pembungkus host memakai window `workspace` (desktop) dan app foreground (mobile). Konsekuensi: `capabilities/default.json` tidak perlu glob label `sync`; butir §13 "role window baru: `sync`" **dibatalkan**. |
| `cloud-sync-ai-mcp.md` §12 #5 | "Struktur repo: workspace di root (`api/`, `shared/`)" **diperluas** dengan `packages/*` (#M2). |
| `mcp-local-free.md` | Tambahkan satu baris: MCP adalah **desktop-only**; mobile tidak menyediakan transport apa pun (#M7). |
| `business-model.md` §2 | Kolom tier perlu menyatakan **mobile app sebagai Plus/Pro**, fitur mobile MVP tanpa MCP (#M7, #M6), tetapi **termasuk AI** (#M15). |
| `collaboration.md` §8 | Tambahkan: mobile ikut mode CRDT untuk shared workspace; **websocket satu koneksi per device** (temuan #6 dokumen itu) kini dipegang **engine `packages/sync`**, bukan window `sync` — desktop memakai window `workspace`, mobile memakai app foreground (#M14). |
| `AGENTS.md` | Setelah M-0: dokumentasikan `packages/*` (termasuk larangan impor `$lib`/`$app`/`@tauri-apps`), `packages/sync` sebagai satu-satunya engine sync, `packages/core/state` sebagai rumah thunk murni, perluasan `check:all`, dan bahwa aturan "tidak ada server-only code" hanya berlaku untuk `src/`. |

---

## 9. Non-goal

Supaya tidak melebar, hal-hal ini **eksplisit di luar** desain ini:

- Web app (browser) — keputusan terpisah, walau `packages/*` akan mempermudah.
- Native UI mobile (Compose/SwiftUI) — #M1 sudah menolaknya.
- MCP/remote MCP di mobile — #M7.
- Kanban/Gantt/Graph di MVP mobile — #M6.
- Tablet/desktop-mode layout khusus — ditinjau setelah MVP stabil.
- Push notification infra — bergantung `collaboration.md` (post-C15).
- **Rust background task untuk sync** — ditolak di #M14; sync berjalan di engine TS saat app hidup.
- **Grant AI tersinkron antar device** — ditolak di #M15; `ai_settings` tetap device-local.
