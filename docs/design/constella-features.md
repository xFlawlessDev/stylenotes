# System Design — Constella-style Intelligence: Semantic Memory, Auto-Linking, Clustering & Contradiction

> Status: **Design final — 19 keputusan (#D1–#D19) + 3 jawaban (#Q1–#Q3), 0 pertanyaan terbuka**
> Tanggal: 2026-09-30
> Scope: mengadopsi enam fitur unggulan Constella ke StyleNotes, **tanpa meninggalkan prinsip local-first**:
> semantic recall (embedding), auto-link suggestion, auto-clustering, contradiction detection, remote MCP, dan import Markdown.
> Dokumen terkait:
> - `docs/design/mcp-local-free.md` — MCP stdio lokal (#D1–#D16). Dokumen ini **memperluas** registry tool-nya (#D8) dan menambah transport HTTP (#D12).
> - `docs/design/cloud-sync-ai-mcp.md` — gateway AI & akun. Embedding server-side (§8) adalah **fallback** untuk #D3 di sini.
> - `docs/design/business-model.md` — remote MCP = Plus/Pro. Fitur ini **tidak boleh** membuka remote untuk tier Free (#D13).
> - `AGENTS.md` — aturan file (≤300/500 LOC), i18n, migrasi, satu pintu tulis.

---

## 0. Ringkasan eksekutif

StyleNotes sudah punya fondasi yang **belum dimiliki** pesaing: graph nyata
(`buildWorkspaceGraph`, 3 jenis edge), AI chat dengan tool-calling + reasoning
trace, dan MCP lokal satu pintu tulis. Yang **kurang** justru bagian yang membuat
Constella terasa "berpikir": **retrieval berbasis makna** dan **koneksi yang
ditemukan sendiri**.

Enam fitur yang diadopsi, semuanya bertingkat:

1. **Semantic recall** — index embedding note/task, dipakai search, `context`, AI chat, dan MCP.
2. **Auto-link suggestion** — usul edge `semantic`/`related`, tampil di graph, accept/reject.
3. **Auto-clustering** — kelompokkan note per tema, tampil sebagai warna/klaster di graph.
4. **Contradiction detection** — edge `contradicts` + kartu penjelasan.
5. **Remote MCP** — endpoint HTTP ber-token untuk agent eksternal (Plus/Pro), dengan pilihan eksposur **Local / LAN / Tunnel**.
6. **Import Markdown** — bawa vault Obsidian / ekspor Notion masuk.

Prinsip pembentuk desain — semuanya konsekuensi dari arsitektur yang ada:

1. **Mesin embedding hibrida (#D3).** Embedding bisa datang dari **model lokal
   ONNX** (offline, default Free) atau **provider BYOK** yang sudah ada. Satu
   antarmuka `Embedder`, dua implementasi. Ini yang dipilih user, bukan
   diasumsikan oleh kode.
2. **Vector store = SQLite, bukan DB terpisah (#D4).** Kita sudah punya
   `tauri-plugin-sql`. Menambah LanceDB/Chroma = proses kedua + sinkronisasi
   state baru. Simpan vektor sebagai BLOB di tabel `embeddings`, hitung cosine
   di Rust. Cukup untuk puluhan ribu note.
3. **Index adalah turunan, bukan sumber kebenaran (#D6).** Tabel `embeddings`
   bisa dihapus dan dibangun ulang kapan saja dari `notes.body`. Note tetap
   satu-satunya sumber. Tidak ada data user yang hilang kalau index rusak.
4. **Tidak ada tulisan otomatis ke graph (#D7).** Auto-link **hanya mengusulkan**,
   lewat tabel `graph_suggestions` (status `pending`/`accepted`/`rejected`).
   Graph nyata tetap hanya berisi edge yang dibuat user atau diterima user.
   Ini mencegah "hairball" yang membuat graph otomatis tak bisa dipercaya.
5. **Satu pintu tulis tetap berlaku (#D7, #D8).** Tool MCP baru (`semantic_search`,
   `related_notes`, `list_themes`, `find_contradictions`) **read-only** dulu.
   Accept/reject suggestion lewat store yang sudah ada, bukan jalur baru.
6. **Gagal dengan anggun saat offline/non-Tauri (#D17).** Tanpa model lokal dan
   tanpa provider, fitur ini **menyembunyikan diri** dan StyleNotes kembali ke
   substring search. Tidak ada error merah, tidak ada layar kosong.

Hasil untuk user: **"note mana yang mirip ini?"**, **"apa tema yang sedang saya
tulis?"**, **"apakah dua note ini bertentangan?"** — dijawab dari makna, bukan
kata kunci, dan tetap 100% lokal kalau user memilih model lokal.

---

## 1. Kondisi kode saat ini (temuan yang membentuk desain)

Dibaca dari `src/lib/content/workspace-graph.ts`, `mcp-tools.ts`,
`ai-tool-schema.ts`, `ai-tools.ts`, `ai-context.ts`, `mcp-snapshot.ts`,
`src/lib/db/ai.ts`, `src/lib/stores/ai*.svelte.ts`,
`src/lib/components/graph/`, `src-tauri/src/lib.rs`, `src-tauri/src/mcp/`.

| # | Temuan | Implikasi ke desain |
|---|--------|---------------------|
| 1 | **Graph sudah matang**: `buildWorkspaceGraph` menghasilkan `GraphNode`/`GraphEdge` dengan 3 edge kind (`wiki`, `dependency`, `link`) dan `degree`/`orphan`. UI graph lengkap: `GraphCanvas.svelte`, `graph-engine.ts`, `graph-shaders.ts`, `graph-layout.ts`, camera, framing, hover card, search panel. | Auto-link & clustering **tidak butuh renderer baru** — cukup menambah edge kind + atribut klaster dan memakai UI yang ada. Ini menghemat sebagian besar pekerjaan. |
| 2 | **Semua edge bersumber dari `[[wiki]]` + relasi task.** `workspace-graph.ts:85–110` hanya membaca `parseWikiReferences` dan `taskNoteIds`/dependencies. Tidak ada jalur untuk edge yang "ditemukan" mesin. | Butuh **jenis edge baru** (`semantic`, `related`, `contradicts`) dan sumber data baru (`graph_suggestions`). `GraphEdgeKind` harus diperluas tanpa memecah `counts`. |
| 3 | **Search = substring.** `search_notes` memakai `matchesQuery` (`ai-read-helpers.ts`); tidak ada stemming, tidak ada ranking, tidak ada vektor. | Semantic recall adalah **tool baru**, bukan pengganti: `search_notes` tetap ada untuk pencarian eksak cepat. |
| 4 | **MCP tool registry adalah sumber tunggal (#D9 dokumen lama).** `mcp-tools.ts` ↔ Rust `registry.rs` dijaga oleh `mcp-tools.test.ts`; descriptor punya `kind`/`scope`. | Tool baru **wajib** ditambahkan di kedua sisi + test drift, atau gagal senyap. Tidak perlu scope baru: keempat tool memory bersifat `notes`-scoped read (#D18). |
| 5 | **`ai-tool-schema.ts` memisahkan `aiOnly` vs MCP.** `web_search`/`web_fetch`/`ask_user_question` hanya untuk asisten. `mcp-tools.test.ts` menegakkan pemisahan dua arah. | `semantic_search`/`related_notes` **boleh dibagi** ke MCP (aman, read-only). Contradiction **juga read-only** → bisa dibagi. Tidak ada tool tulis baru di Fase ini. |
| 6 | **Snapshot MCP (`mcp-snapshot.ts`) dibangun dari note+task+dependency+workspace**, tanpa folder (`ai-context.ts:49` mengirim `folders: []`). | Embedding **tidak** boleh masuk snapshot (akan membengkakkan file JSON puluhan MB). Snapshot membawa **skor/daftar id** saja; skor dihitung di app sebelum snapshot ditulis, atau lewat tool handler khusus. Lihat #D15. |
| 7 | **Rust sudah punya stack AI** (`src-tauri/src/ai/`: provider, cipher AES-256-GCM, `ai_stream` via Channel, `web.rs` untuk jaringan). | Embedding provider **menumpang** stack ini: satu command `ai_embed` baru, memakai `ProviderConfig` + kunci yang sudah didekripsi. Tidak ada klien HTTP kedua. |
| 8 | **Kunci API terenkripsi at rest** (`enc:v1:`, `app_data_dir()/ai/secrets.key`). | Kunci embedding **wajib** memakai jalur yang sama. Ini alasan kuat memilih #D3 (hibrida) alih-alih "panggil dari frontend". |
| 9 | **Pola migrasi konsisten**: `Migration { version: N }` di `lib.rs`, terakhir **18**. Tidak boleh mengedit migrasi yang sudah jalan. | Fitur ini menambah **migrasi 19–21** (lihat §5). |
| 10 | **Pola store berulang**: tabel → repo (`boolean`) → store `.svelte.ts` (hydrate/refresh/emit lintas-window) → komponen Settings. Persis `ui_plugins.svelte.ts` dan `mcp.svelte.ts`. | Index embedding, suggestions, dan clusters **meniru pola ini**; tidak ada pola baru. |
| 11 | **Windows multi & hide-on-close** (workspace/overlay/kanban) + detail window `destroy()` saat tutup. Satu proses menulis SQLite. | Pekerjaan index (backfill, re-embed) harus berjalan di **satu window saja** (workspace) dengan guard, seperti `mcp-host.svelte.ts`. Lihat #D16. |
| 12 | **Aturan i18n**: setiap string user-facing lewat `t()`, locale di `src/lib/i18n/locales/{en,id}/`, English = schema. Terjemahan **tidak** untuk teks yang dipersistensi. | Semua label fitur baru (chip "Contradicts", "Tema", tombol Accept) wajib masuk locale. Nilai `graph_suggestions.reason` yang dipersistensi tetap English. |
| 13 | **Batas file keras 500 LOC**, target 300. `lib.rs`, `GraphCanvas.svelte` sudah besar. | Modul baru dipecah sejak awal: `content/embeddings.ts`, `content/semantic.ts`, `content/clusters.ts`, `content/contradictions.ts`, `db/embeddings.ts`, `stores/memory.svelte.ts`. |
| 14 | **Capabilities**: `capabilities/default.json` mengatur permission; permission yang hilang gagal senyap. `mcp_host.rs` sudah memegang file bridge; `ai/web_html.rs` punya `is_blocked_host` untuk memblokir alamat privat **keluar**. | Remote MCP (#D12) **tidak** butuh permission window baru (listener di Rust, bukan webview). Mode LAN butuh helper kebalikannya — mendeteksi alamat privat **masuk** — di `mcp/net.rs`, terpisah agar tidak salah pakai helper SSRF yang ada. |
| 15 | **Tidak ada importer file** di kode saat ini; `resetData()`/seed adalah satu-satunya jalur masuk data massal. | Import Markdown (#D14) adalah modul baru di `src/lib/content/markdown-import.ts` (pure, teruji) + dialog, memakai `notesRepo.upsert` yang sudah menstempel `updatedAt`. |

**Kesimpulan:** tidak ada blocker arsitektural — keenam fitur adalah **perluasan**
dari tiga fondasi yang sudah ada (graph, registry tool, jalur kunci AI).
Karena itu urutannya bertingkat, bukan paralel: Fase 1 adalah prasyarat Fase 2.

---

## 2. Arsitektur

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  StyleNotes (Tauri, satu proses)                                                  │
│                                                                                  │
│  ┌─ Embedder (abstraksi, #D3) ──────────────────────────────────────────────┐    │
│  │  trait Embedder                                                          │    │
│  │   ├─ OnnxEmbedder   (lokal, default Free, offline)   ← feature "local-embed" │
│  │   └─ ProviderEmbedder (BYOK, OpenAI-compatible)      ← memakai ai/ stack  │    │
│  └───────────────┬──────────────────────────────────────────────────────────┘    │
│                  │ ai_embed(texts) → Vec<Vec<f32>>                               │
│                  ▼                                                               │
│  ┌─ Index (turun, #D6) ────────────────┐   ┌─ Graph nyata (sumber user) ─────┐  │
│  │ tabel embeddings(id, kind, model,   │   │ buildWorkspaceGraph              │  │
│  │   dim, vec BLOB, content_hash)      │   │  edge: wiki | dependency | link  │  │
│  └───────────────┬─────────────────────┘   └────────────▲────────────────────┘  │
│                  │ cosine (Rust)                        │ accepted                │
│                  ▼                                      │                         │
│  ┌─ Mesin usulan (read-only, #D7) ──────────────────────┴───────────────────┐   │
│  │ semantic.ts     → related_notes / semantic_search                        │   │
│  │ clusters.ts     → list_themes (k-means ringan di atas vektor)            │   │
│  │ contradictions.ts → find_contradictions (LLM verifikasi pasangan mirip)  │   │
│  └───────────────┬──────────────────────────────────────────────────────────┘   │
│                  │                                                               │
│                  ▼                                                               │
│  ┌─ graph_suggestions (migrasi 20) ── status: pending|accepted|rejected ─────┐   │
│  │  ditampilkan di GraphDrawer sebagai edge putus-putus + kartu Accept/Reject│   │
│  └───────────────┬──────────────────────────────────────────────────────────┘   │
│                  │ accept → store yang sudah ada (edge jadi bagian graph)        │
│                  ▼                                                               │
│  ┌─ AI chat / MCP ──────────────────────────────────────────────────────────┐   │
│  │  AI_TOOLS += semantic_search | related_notes | list_themes                │   │
│  │  MCP_TOOLS += idem (read-only, aman)      [registry dua sisi + test]      │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Remote MCP (#D12, Plus/Pro)                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │ axum listener (Rust) :7317 — bind per mode (loopback|LAN), Bearer token   │   │
│  │  → mcp_host.rs   [mode dipilih user di Settings; default loopback]        │   │
│  │  → job file → workspace window (§ arsitektur mcp-local-free.md)          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Komponen baru

| Komponen | Teknologi | Tanggung jawab |
|---|---|---|
| `src-tauri/src/embed/` | Rust | `Embedder` trait, `OnnxEmbedder`, `ProviderEmbedder`, cosine, command `ai_embed` |
| `src/lib/content/embeddings.ts` | TS murni | Penyusunan teks yang di-embed (judul+body+tag), chunking, `content_hash`, tipe & konstanta. **Teruji Vitest.** |
| `src/lib/content/semantic.ts` | TS murni | Ranking + threshold + format hasil untuk `semantic_search`/`related_notes`. **Teruji.** |
| `src/lib/content/clusters.ts` | TS murni | k-means/seeded clustering di atas vektor, labeling klaster. **Teruji.** |
| `src/lib/content/contradictions.ts` | TS murni | Pemilihan pasangan kandidat (mirip) + prompt + parse verdict. **Teruji.** |
| `src/lib/content/markdown-import.ts` | TS murni | Parse vault/folder/berkas markdown → daftar note + link. **Teruji.** |
| `src/lib/db/embeddings.ts` | TS | Repo `embeddings` + `graph_suggestions` + `clusters` (return `boolean`). |
| `src/lib/stores/memory.svelte.ts` | Svelte 5 runes | Orkestrasi index: backfill, re-embed saat note berubah, status/progress, emit lintas window. |
| `src/lib/components/graph/GraphSuggestionCard.svelte` | Svelte | Kartu Accept/Reject untuk usulan link. |
| `src/lib/components/graph/GraphThemeLegend.svelte` | Svelte | Legenda klaster/tema di graph. |
| `src/lib/components/workspace/MemorySettings.svelte` | Svelte | Settings: pilih embedder, status index, tombol reindex, ambang kemiripan. |
| `src/lib/components/workspace/ImportMarkdownDialog.svelte` | Svelte | Dialog import, pilih folder/berkas, pratinjau, konfirmasi. |
| `src-tauri/src/mcp/http.rs` | Rust | Listener HTTP remote MCP + auth Bearer + transport Streamable HTTP. |
| `src-tauri/src/mcp/net.rs` | Rust | Deteksi alamat LAN + validasi `Host`/`Origin` (anti DNS-rebinding). Teruji tanpa jaringan nyata. |
| Tabel `embeddings`, `graph_suggestions`, `clusters` | Migrasi 19–21 | Lihat §5. |

---

## 3. Keputusan arsitektur

### D1 — Enam fitur, tiga fase, satu arah ketergantungan

| Fase | Fitur | Bergantung pada |
|---|---|---|
| **1. Memory substrate** | Semantic recall (#D2–#D6) | — |
| **2. Graph intelligence** | Auto-link (#D7), clustering (#D9), contradiction (#D10) | Fase 1 |
| **3. Reach & flow** | Remote MCP (#D12), import markdown (#D14) | — (independen) |

**Keputusan:** kerjakan berurutan Fase 1 → 2. Fase 3 boleh paralel kapan saja
karena tidak menyentuh memory substrate. **Tidak** membangun clustering atau
contradiction di atas keyword matching — hasilnya akan buruk dan merusak
kepercayaan user pada fitur (pelajaran dari review pesaing, §"Penilaian jujur"
riset).

### D2 — Kenapa embedding, bukan "LLM baca semua note tiap kali"

| Opsi | Penilaian |
|---|---|
| **A. Index vektor persisten** ✅ | Biaya sekali saat index; retrieval O(n) cosine murni di Rust; offline; deterministik |
| B. Kirim semua note ke LLM tiap query | Biaya token meledak, lambat, tidak offline, tidak skalabel |
| C. Hanya keyword + sinonim buatan | Murah tapi tidak menangkap makna; ini yang sedang kita perbaiki |

**Keputusan:** A.

### D3 — Embedder hibrida: lokal (ONNX) atau provider (BYOK)

**Keputusan:** satu abstraksi di Rust, dua implementasi:

```rust
pub trait Embedder: Send + Sync {
    fn id(&self) -> &str;          // mis. "onnx:minilm-l6" | "provider:text-embedding-3-small"
    fn dim(&self) -> usize;
    fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, EmbedError>;
}
```

- **`OnnxEmbedder`** — default untuk Free. Model kecil (~30–90 MB, mis. MiniLM-L6
  atau EmbeddingGemma-512 yang dipakai Constella), diunduh **sekali** ke
  `app_data_dir()/models/`, dijalankan lewat `ort` (ONNX Runtime). Di balik
  Cargo feature `local-embed` supaya build tanpa model tetap ringan.
- **`ProviderEmbedder`** — memakai `src-tauri/src/ai/` yang ada (ProviderConfig +
  kunci terdekripsi). Mendukung endpoint `embeddings` OpenAI-compatible.

Pemilihan embedder ada di **section `Memory` tersendiri** di Settings (#Q1),
bukan digabung ke `AI`: embedder, status index, jumlah vektor, tombol rebuild,
ambang kemiripan dan ukuran klaster adalah konfigurasi berat yang berbeda dari
"kunci chat" — dan memisahkannya menjaga `AiSettings.svelte` tetap di bawah
batas LOC.

**Konsekuensi penting:** karena `model` disimpan bersama setiap vektor (#D5),
berpindah embedder **tidak** merusak data — vektor model lama dianggap
tidak valid dan di-reindex (#D6). Tidak pernah membandingkan vektor dari dua
model berbeda.

### D4 — Vector store di SQLite, bukan DB vektor terpisah

| Opsi | Penilaian |
|---|---|
| **A. Tabel `embeddings` + BLOB, cosine di Rust** ✅ | Nol proses baru, nol file baru, ikut backup/transaksi SQLite yang ada; exact recall 100%; cukup untuk **seluruh plafon desain StyleNotes** (lihat catatan skala di bawah) |
| B. LanceDB (dipakai Constella-OS) | ANN cepat & native VectorDB, tapi proses/berkas baru, state kedua yang harus disinkronkan & di-backup |
| C. sqlite-vec extension | Terbaik untuk skala besar, tapi butuh memuat extension ke `tauri-plugin-sql` (perubahan infrastruktur) |

**Keputusan:** A untuk V1. Titik naik ke C tidak dijadwalkan; hanya dipertimbangkan
bila ada keluhan performa nyata dari user (#Q3, #D19).

**Catatan skala (mengapa A jelas cukup).** Data komunitas (forum Obsidian &
Evernote) menunjukkan **mayoritas mutlak user punya < 300 note**; median
pengguna yang serius ~1.000–4.000; pengguna berat bertahun-tahun 5.000–18.000;
dan stress-test resmi Obsidian sendiri adalah **20.000 note**. Beban brute-force
cosine ber-dim 384:

| Skenario | Entity | Waktu/query (1 core) |
|---|---|---|
| User tipikal | 1.000 | **~0,3 ms** |
| Serius | 4.000 | ~1,5 ms |
| Berat | 18.000 | ~7 ms |
| Stress test | 40.000 | ~16 ms |
| Anomali langka | 70.000 | ~28 ms |

Artinya **untuk ~99% user, brute force praktis instan** (< 1 ms), dan tetap
< 30 ms bahkan pada vault terbesar yang pernah dilaporkan komunitas. Dua alasan
tambahan yang membuat A **lebih tepat**, bukan sekadar cukup: (1) brute-force
adalah **exact** — ANN mengorbankan recall (~90–95%), dan untuk second brain
pribadi hasil yang selalu benar lebih berharga daripada kecepatan yang belum
dibutuhkan; (2) yang sebenarnya berat bukan pencarian, melainkan **re-embedding**
saat backfill — dan ANN tidak menyelesaikan itu sama sekali (#D16 yang
menangani).

> **Anti-overengineering (#D19).** Karena itu **tidak** ada ANN, **tidak** ada
> paralelisasi multi-core, dan **tidak** ada chunking di V1 — semuanya
> mengoptimalkan skenario yang < 0,1% user alami. Plafon 40.000 hanya jaring
> pengaman, bukan target. Tanpa keluhan performa nyata dari user, brute force
> adalah jawabannya; `rayon`/sqlite-vec tetap pintu darurat yang tidak kita
> masuki.

### D5 — Skema: satu tabel vektor untuk semua entity

```
embeddings(
  entity_kind TEXT,      -- 'note' | 'task'
  entity_id   TEXT,
  model       TEXT,      -- Embedder::id() saat vektor dibuat
  dim         INTEGER,
  vec         BLOB,      -- f32 little-endian, dim*4 byte
  content_hash TEXT,     -- hash teks sumber; berubah ⇒ re-embed
  updated_at  INTEGER,
  PRIMARY KEY (entity_kind, entity_id)
)
```

- **Satu baris per entity**, bukan per chunk di V1. Note StyleNotes umumnya
  pendek–sedang; chunking menambah kompleksitas tanpa manfaat jelas dulu.
  Chunking dicatat sebagai penyempurnaan masa depan, bukan bagian V1.
- `content_hash` adalah kunci efisiensi: saat note berubah, kita **hanya**
  re-embed kalau teks sumbernya benar-benar berbeda (bukan setiap keystroke).
- Vektor disimpan `f32` LE; helper encode/decode di `content/embeddings.ts`
  (pure, teruji) supaya Rust dan TS tidak pernah berbeda tafsir layout.

### D6 — Index adalah turunan, selalu bisa dibangun ulang

**Keputusan:** `embeddings` tidak pernah menjadi sumber kebenaran.
`delete from embeddings` + reindex harus menghasilkan index yang identik
(deterministik, kecuali model). Tiga konsekuensi:

1. Tidak ada migrasi yang memindahkan data note ke sini.
2. Kerusakan/versi model baru → tombol **"Rebuild index"** di Settings, bukan
   skema perbaikan.
3. Index boleh "ketinggalan" (stale) — retrieval tetap benar, hanya kurang segar.

### D7 — Auto-link mengusulkan, tidak pernah menulis graph

Ini keputusan paling penting untuk kualitas produk.

| Opsi | Penilaian |
|---|---|
| A. Auto-link **langsung** menambah edge ke graph | Graph cepat jadi hairball; user kehilangan rasa "ini graph saya"; sulit dibatalkan |
| B. Auto-link **mengusulkan**, user Accept/Reject ✅ | Graph tetap milik user; usulan bisa dijelaskan; aman |
| C. Auto-link tersembunyi (hanya skor, tak terlihat) | Tidak ada UI untuk membangun kepercayaan; tidak actionable |

**Keputusan:** B. Tabel `graph_suggestions`:

```
graph_suggestions(
  id            TEXT PRIMARY KEY,
  source_kind   TEXT, source_id TEXT,
  target_kind   TEXT, target_id TEXT,
  edge_kind     TEXT,          -- 'semantic' | 'related' | 'contradicts'
  score         REAL,          -- cosine, untuk 'semantic'
  reason        TEXT,          -- English, penjelasan (persisted ⇒ tidak diterjemahkan)
  status        TEXT,          -- 'pending' | 'accepted' | 'rejected'
  created_at    INTEGER, decided_at INTEGER
)
```

**Hanya** saat user Accept: edge nyata dibuat (via store), `status='accepted'`.
Reject disimpan supaya pasangan yang sama **tidak** diusulkan lagi (#D8).

### D8 — Anti-spam usulan

Tiga aturan, semuanya di `semantic.ts` (pure, teruji):

1. Jangan usulkan pasangan yang **sudah punya edge** nyata (wiki/task/semantic).
2. Jangan usulkan pasangan yang pernah **`rejected`**.
3. Batasi **N usulan tertinggi** per note per siklus (default 3), dan satu
   pasangan hanya muncul sekali (pasangan diurutkan, bukan berarah duplikat).

### D9 — Clustering dijalankan lokal, label dari LLM (opsional)

- **Pengelompokan** = k-means ringan di atas vektor (deterministik dengan seed
  tetap, di `clusters.ts`). Tidak butuh LLM, jalan offline, cepat.
- **Label tema** = opsional; kalau embedder/provider tersedia, satu panggilan
  LLM memberi nama tema ("vector retrieval", "travel japan"). Kalau tidak ada,
  label jatuh ke istilah paling sering muncul (TF sederhana) — tetap berguna.
- Tampilan: klaster diberi warna di graph yang sudah ada via
  `GraphThemeLegend.svelte`; **tidak** mengubah layout paksa (menghormati
  keputusan desain graph yang ada: "focus means the world steps back").

### D10 — Contradiction = kandidat mirip + verifikasi LLM

Deteksi kontradiksi **murni vektor tidak mungkin** (dua teks mirip bisa
konsisten). Karena itu dua tahap:

1. **Kandidat**: pasangan dengan cosine tinggi (top-K) — ini menyaring ruang
   pencarian dari O(n²) ke beberapa lusin pasangan.
2. **Verifikasi**: satu panggilan LLM per pasangan (batch) → verdict
   `contradicts | consistent | unrelated` + alasan singkat.
3. Verdict `contradicts` → `graph_suggestions` dengan `edge_kind='contradicts'`,
   ditampilkan sebagai kartu khas (meniru widget "Contradicts" Constella).
   **Selalu** butuh verifikasi user sebelum jadi edge nyata (#D7).

Fitur ini **butuh provider LLM**; tanpa itu hanya bagian kandidat yang jalan.
UI menyembunyikan tombol kalau AI tidak dikonfigurasi (#D17).

### D11 — Semantic recall sebagai tool baru, bukan pengganti search

`semantic_search` dan `related_notes` ditambahkan **di samping** `search_notes`.
Alasan: pencarian eksak (cari id, istilah persis, kode) tetap lebih baik
dengan substring. Tool description menjelaskan kapan memakai yang mana, supaya
model memilih dengan benar. `context` (sudah ada) diperkaya agar memakai
vektor kalau index tersedia, jatuh ke perilaku lama kalau tidak.

### D12 — Remote MCP: tiga tingkat eksposur jaringan (loopback / LAN / tunnel), Plus/Pro

**Keputusan:** endpoint HTTP remote MCP dengan **tiga tingkat eksposur yang dipilih
user**, bukan satu bind tetap. Tujuannya: user bisa memakai agent dari mesin lain
di rumah/kantor (LAN) tanpa kami memaksa bind publik yang berbahaya.

| Tingkat | Bind | Siapa yang bisa menjangkau | Default |
|---|---|---|---|
| **Local** | `127.0.0.1` | Hanya proses di mesin ini | ✅ (saat remote dinyalakan) |
| **LAN** | interface LAN **saja** (`192.168.x.x` / `10.x` / `fe80::`) | Mesin di jaringan lokal yang sama | ❌ opt-in |
| **Tunnel** | tetap `127.0.0.1`; user memakai Cloudflare Tunnel/Tailscale sendiri | Siapa pun yang bisa menjangkau tunnel | ❌ opt-in |

Prinsip yang dipertahankan di **semua** tingkat:

- **Bearer token wajib.** Dibuat aplikasi, disimpan device-local (migrasi 22),
  rotasi satu klik. Wajib bahkan untuk loopback — mencegah web lokal memanggil
  API secara buta.
- **Default mati**; satu toggle + dialog konfirmasi.
- **Plus/Pro saja** (#D13). Free tetap stdio saja.
- **Transport Streamable HTTP** (MCP 2025-06-18).
- Tetap **satu pintu tulis**: listener memanggil `mcp_host.rs` yang ada (job file
  → workspace window → store). Tidak ada jalur tulis baru.
- **Anti-DNS-rebinding**: `Host` header diverifikasi terhadap alamat lokal yang
  valid; header `Origin` yang ada **selalu ditolak** (agen CLI tidak mengirimnya,
  halaman web mengirimnya).

**Pagar khusus tingkat LAN** (karena ini yang menaikkan risiko paling banyak):

1. **Bind ke interface LAN spesifik, bukan `0.0.0.0`.** `0.0.0.0` menjangkau
   semua interface termasuk yang tak terduga; kita bind hanya alamat privat yang
   terdeteksi. Tidak ada binding ke interface publik.
2. **Konfirmasi eksplisit + peringatan teks.** Dialog menyatakan dengan jujur:
   *"Siapa pun di jaringan lokalmu yang memiliki token ini bisa membaca dan
   mengubah catatanmu."* Tidak ada default, tidak ada "ingat pilihan".
3. **Token berumur pendek + wajib rotasi pada perpindahan tingkat.** Naik dari
   Local ke LAN mengganti token, sehingga token lama yang mungkin bocor tidak
   ikut terpapar ke jaringan.
4. **Rate limit per-IP** di tingkat listener (mis. 60 req/menit) untuk membatasi
   penyalahgunaan bila token bocor.
5. **Audit mencatat alamat asal.** `mcp_audit` yang ada menambah kolom `remote_addr`,
   jadi user bisa melihat dari mana panggilan datang.
6. **Kill switch prominent**: satu tombol "Matikan remote" di status bar/rail,
   bukan hanya di Settings, supaya respons insiden cepat.
7. **Tidak pernah ekspos tulis tanpa grant eksplisit.** Grant write yang ada
   (`Grant.allow_write`) tetap berlaku identik; LAN tidak menaikkan hak akses
   sendiri.
8. **Peringatan bila terdeteksi jaringan publik.** Kalau interface aktif adalah
   Wi-Fi publik/kafe (heuristik SSID tidak tersedia lintas-platform, jadi pakai
   penanda "network profile is public" di Windows; di platform lain tampilkan
   pengingat), tampilkan peringatan tambahan sebelum mengizinkan LAN.
9. **Dokumentasi cara mencabut**: halaman Settings menampilkan langkah mematikan
   + merotasi token + (opsional) membatalkan sesi aktif.

**Kenapa Tunnel tetap `127.0.0.1`?** Karena solusi tunnel (Cloudflare/Tailscale)
sudah menangani enkripsi, autentikasi identitas, dan traversal NAT — lebih baik
daripada apa pun yang kami tulis sendiri. Kami tidak mencoba membuat "mode
internet" sendiri.

**Kenapa bukan sekadar membuka stdio ke jaringan?** stdio tidak punya konsep
auth; begitu di-bind ke TCP, "trust boundary" berubah dari "bisa spawn proses"
menjadi "bisa menjangkau port". Untuk LAN, trust boundary menjadi "bisa
menjangkau jaringan lokal + memiliki token". Itulah kenapa LAN adalah **opt-in
eksplisit**, bukan perluasan default. Dokumen lama (#D11 `mcp-local-free.md`)
menolak HTTP **untuk Free**; dokumen ini hanya membukanya untuk tier berbayar,
konsisten dengan business-model.

> **Catatan implementasi.** `web_html.rs` sudah punya `is_blocked_host` untuk
> memblokir alamat privat **keluar** (SSRF). Modul LAN ini membutuhkan helper
> kebalikannya — "apakah alamat ini privat/lokal" untuk **masuk** (`Host` header
> yang sah) — sehingga dua kepentingan berbeda itu tidak salah pakai helper yang
> sama. Deteksi alamat LAN ada di modul Rust tersendiri (`mcp/net.rs`), teruji
> tanpa jaringan nyata.

### D13 — Remote MCP adalah fitur berbayar; local tetap gratis

Konsisten dengan `business-model.md` (remote MCP = Plus/Pro). Embedding **lokal**
tetap gratis (filosofi local-first). Embedding **via provider** hanya butuh kunci
milik user → tetap fitur Free (BYOK). Tidak ada fitur memory yang dikunci di
balik langganan kecuali remote MCP.

### D14 — Import Markdown: vault/folder/berkas, non-destruktif

- Sumber: file `.md` tunggal, folder, atau ekspor Obsidian (wikilink
  `[[..]]` dipertahankan apa adanya — parser kita sudah memahaminya).
- Frontmatter YAML sederhana → `tags` bila ada.
- **Non-destruktif**: tidak ada import yang menghapus note yang ada; konflik
  judul → note baru atau skip (pilihan user di dialog).
- Struktur folder sumber → folder StyleNotes; kalau tidak ada, `Inbox`.
- Jalur tulis **hanya** `notesRepo.upsert` (menstempel `updatedAt`, #AGENTS.md).
- Pure parsing di `markdown-import.ts` (teruji), I/O hanya di dialog/store.

### D15 — Vektor tidak pernah masuk snapshot MCP

Snapshot adalah file JSON yang dibaca shim. Menaruh vektor di sana akan
menggelembungkan file dan memperlambat setiap tool call. Maka:

- Snapshot tetap berisi note/task/graph seperti sekarang.
- Tool semantic **dieksekusi di dalam app** (workspace window), yang membaca
  tabel `embeddings` langsung dan mengembalikan **daftar id + skor**, bukan
  vektor. Shim meneruskan hasil yang sudah jadi.
- Ini konsisten dengan #D2 dokumen lama ("tulis lewat app"); di sini "baca
  berat lewat app".

### D16 — Pekerjaan index berjalan di satu window, dapat dibatalkan

Seperti `mcp-host.svelte.ts`, hanya window `workspace` yang menjalankan:
backfill awal, re-embed saat note berubah, siklus usulan. Guard:

- `if (indexing) return` — tidak ada dua siklus bersamaan.
- Batch kecil (mis. 16 note/panggilan `ai_embed`) + `requestIdleCallback`/delay,
  supaya UI tidak tersendat.
- Setiap langkah **dapat dibatalkan** saat window unload / user menekan Stop.
- Progress dipublikasikan lewat store, ditampilkan di Settings & indikator kecil.

### D17 — Degradasi berjenjang (tanpa error merah)

| Kondisi | Perilaku |
|---|---|
| Non-Tauri / browser | Fitur memory **disembunyikan**; search tetap substring |
| Tauri, tanpa embedder terkonfigurasi | Tombol "Aktifkan memory" di Settings; tool semantic tidak didaftarkan |
| Embedder ada, index kosong | Tool semantic menjawab "index sedang dibangun"; backfill otomatis |
| Provider mati / offline saat provider dipilih | Status "offline"; tawaran pindah ke model lokal |
| Model lokal belum diunduh | Tombol "Unduh model (xx MB)" dengan progress |

**Prinsip:** fitur ini **menambah**, tidak pernah menggantikan kemampuan lama.

### D18 — Registry dua sisi tetap dijaga test

`semantic_search` dan `related_notes` masuk **kedua** registry
(`mcp-tools.ts` + `ai-tool-schema.ts` + Rust `registry.rs`) dan
`list_themes`/`find_contradictions` masuk sebagai read-only juga. Test yang
sudah ada (`mcp-tools.test.ts`) **diperluas**: jumlah tool, scope, dan
pemisahan `aiOnly` diverifikasi dua arah, persis seperti `web_*`.

---

## 4. Alur (use case)

**A. Membangun index pertama kali**
`Settings → Memory` → pilih embedder (lokal) → Unduh model → "Build index" →
store membaca semua note/task, batch 16, `ai_embed`, simpan BLOB + `content_hash`
→ progress bar → selesai. Note berikutnya otomatis re-embed saat berubah.

**B. User bertanya "note apa yang mirip ini?"**
Note terbuka → tombol "Related" → `related_notes(id)` → cosine terhadap note
itu → daftar top-8 dengan skor → klik → note terbuka (di window detail).

**C. Agent MCP bertanya lintas makna**
Claude: `semantic_search("trade-off retrieval vs long-context")` → tool
dieksekusi di app → hasil id+skor+snippet → Claude menjawab dengan sitasi note.

**D. Auto-link suggestion muncul**
Selesai re-embed sebuah note, `semantic.ts` menghitung kandidat (#D8) →
`graph_suggestions` `pending` → `GraphDrawer` menampilkan edge putus-putus +
`GraphSuggestionCard` ("Mirip 0.83 — keduanya membahas graph-RAG").
Accept → edge `semantic` nyata di graph. Reject → tidak muncul lagi.

**E. Melihat tema**
`Graph → Themes` → `clusters.ts` menjalankan k-means atas vektor → klaster +
label (LLM atau TF) → `GraphThemeLegend` mewarnai node; memilih tema
menyorot anggotanya.

**F. Cek kontradiksi**
`Graph → Contradictions` → top-K pasangan mirip → LLM memverifikasi →
kartu "Bertentangan" dengan kutipan kedua sisi → user memutuskan (edge/tidak).

**G. Remote MCP — tingkat Local (mesin sendiri)**
Settings → MCP → aktifkan Remote (Plus) → pilih tingkat **Local** → token dibuat →
salin snippet (`claude mcp add --transport http stylenotes
http://127.0.0.1:7317/mcp --header "Authorization: Bearer …"`) → agent menembak
endpoint → listener memverifikasi token → job file → workspace → hasil. Matikan
toggle = listener berhenti.

**G2. Remote MCP — tingkat LAN (mesin lain di jaringan)**
Settings → MCP → tingkat **LAN** → dialog konfirmasi menyatakan siapa yang bisa
menjangkau + konsekuensinya → token dirotasi → daftar alamat LAN ditampilkan →
user memakai alamat itu di agent di laptop/HP-nya → setiap panggilan tercatat
`remote_addr` di audit. Tombol "Matikan remote" tersedia di rail untuk respons
cepat. Kembali ke Local = token dirotasi lagi.

**H. Import vault Obsidian**
Settings → Import → pilih folder vault → pratinjau (n note, m wikilink, k tag) →
konfirmasi → note dibuat/folder dibuat → graph langsung memperlihatkan tautan
`[[..]]` yang sudah dikenali parser kita.

---

## 5. Migrasi & skema

| Versi | Isi |
|---|---|
| **19** | `embeddings` (lihat #D5). Index `idx_embeddings_model (model)` untuk reindex selektif. |
| **20** | `graph_suggestions` (lihat #D7). Index `(status)`, unik `(source_kind,source_id,target_kind,target_id,edge_kind)`. |
| **21** | `clusters` (id, label, entity_kind, entity_id, run_id, score) — hasil clustering terakhir; kolom `run_id` supaya siklus lama bisa dibuang atomik. |
| **22** | `remote_mcp` (mode `local|lan|tunnel`, token hash + hint, `created_at`, `rotated_at`) — device-local, berisi rahasia. Plus `ALTER TABLE mcp_audit ADD COLUMN remote_addr TEXT` untuk tingkat LAN (#D12). |

Catatan:
- **Preferensi memory lewat `metaRepo`, bukan tabel baru (#Q2).** Embedder
  terpilih, ambang kemiripan, dan ukuran klaster disimpan sebagai kunci
  `meta:memory/*` — pola yang sudah dipakai `meta:mcp/enabled`. Nilainya kecil,
  tidak relasional, tidak perlu di-query, jadi tabel + repo + store tersendiri
  hanya menambah kode. **Pengecualian: token remote MCP** disimpan terpisah
  (tabel `remote_mcp` di migrasi **22**) karena ia rahasia, perlu rotasi, dan
  punya lifecycle — bukan sekadar preferensi. **Token disimpan sebagai hash**
  (hint saja yang ditampilkan di UI), sehingga bocornya file DB tidak langsung
  membocorkan token.
- **Mode jaringan** (`local`/`lan`/`tunnel`) disimpan bersama token di tabel yang
  sama, bukan di `metaRepo`: ia bermakna hanya bersama token, dan berpindah mode
  wajib merotasi token (#D12).
- Semua preferensi memory & token **device-local** (seperti `ai_settings`,
  `mcp_settings`). Jangan pernah masuk `settings` tersinkron — token akan bocor
  lewat sync.
- Semua kolom timestamp integer (ms epoch), konsisten dengan arah `updated_at`
  di `notes` (migrasi 12).
- Tidak ada migrasi yang menyentuh tabel yang sudah ada secara destruktif.

---

## 6. Perubahan pada modul yang ada

| Modul | Perubahan |
|---|---|
| `src/lib/content/workspace-graph.ts` | `GraphEdgeKind` += `'semantic' \| 'related' \| 'contradicts'`; `counts` diperluas; opsi baru `suggestions?: GraphSuggestion[]` supaya edge usulan bisa dirender berbeda (putus-putus). Edge nyata **tidak** berubah sumbernya. |
| `src/lib/content/mcp-tools.ts` | +4 read tool: `semantic_search`, `related_notes`, `list_themes`, `find_contradictions` (#D18). |
| `src/lib/content/ai-tool-schema.ts` | Definisi JSON Schema untuk 4 tool itu; semuanya non-`aiOnly` (aman dibagi), read-only. |
| `src/lib/content/ai-tools.ts` | Handler membaca index lewat hook yang disuntikkan (`memory?`), tetap pure & teruji (#D15). |
| `src/lib/content/ai-context.ts` | Menyuntikkan hook memory ke `ToolContext` bila tersedia. |
| `src/lib/content/mcp-snapshot.ts` | **Tidak** berubah bentuknya; hanya `revision`/`today` seperti sekarang. Vektor tidak masuk (#D15). |
| `src-tauri/src/lib.rs` | Migrasi 19–21; daftarkan command `ai_embed`, `memory_reindex`, `remote_mcp_*`; feature flag `local-embed`. |
| `src-tauri/src/mcp/` | `registry.rs` += 4 tool; `http.rs` baru untuk transport remote (#D12). |
| `src/lib/components/graph/*` | Drawer menampilkan usulan; legenda tema; kartu kontradiksi. Layout tidak dipaksa berubah. |
| `src/lib/components/workspace/SettingsPanel.svelte` | Tambah nav `Memory` sendiri (#Q1, sudah diputuskan) + `Import`. |
| i18n `en/`, `id/` | Section baru `memory`/`import`; English = schema. |

---

## 7. Pengujian

| Lapisan | Test |
|---|---|
| Pure TS (`embeddings.ts`) | encode/decode f32↔bytes round-trip; `content_hash` stabil & berubah saat isi berubah; penyusunan teks embed; deteksi perubahan model |
| Pure TS (`semantic.ts`) | ranking & ambang; #D8 anti-spam (skip sudah-beredge, skip rejected, batas N, dedup pasangan tak berarah) |
| Pure TS (`clusters.ts`) | k-means deterministik dengan seed; jumlah klaster; label TF fallback |
| Pure TS (`contradictions.ts`) | pemilihan top-K kandidat; parse verdict LLM (termasuk jawaban rusak → `unrelated`) |
| Pure TS (`markdown-import.ts`) | frontmatter→tags; `[[wikilink]]` dipertahankan; konflik judul; inferensi folder |
| Registry drift | `mcp-tools.test.ts` diperluas: 4 tool baru ada di TS **dan** Rust, scope & kind cocok, `aiOnly` split benar (#D18) |
| Graph | `workspace-graph.test.ts`: edge kind baru, `counts`, `suggestions` dirender terpisah tanpa mengubah `degree` edge nyata |
| Rust | unit `cosine`, encode layout cocok dengan TS, `OnnxEmbedder`/`ProviderEmbedder` di belakang trait (mock embedder untuk CI tanpa model) |
| Rust (`mcp/net.rs`) | klasifikasi alamat privat/lokal; validasi `Host` sah & tolak `Host` asing; tolak `Origin`; bind hanya ke alamat privat terdeteksi (bukan `0.0.0.0`); rotasi token saat ganti mode (#D12) |
| Degradasi | #D17: tanpa embedder → tool tidak terdaftar, UI menyembunyikan, search substring tetap jalan |

**CI tanpa model:** semua test Rust memakai `MockEmbedder` (vektor tetap), jadi
`bun run check`/`test`/`clippy`/`fmt:check` hijau tanpa mengunduh model.

---

## 8. Loc / pemecahan file

Sesuai `AGENTS.md` (target 300, cap 500):

- `content/embeddings.ts` — tipe + codec + hashing + teks-sumber (~150)
- `content/semantic.ts` — ranking + filter anti-spam (~200)
- `content/clusters.ts` — k-means + label (~200)
- `content/contradictions.ts` — kandidat + prompt + parse (~180)
- `content/markdown-import.ts` — parse + rencana impor (~250)
- `db/embeddings.ts` — repo (~200)
- `stores/memory.svelte.ts` — orkestrasi; kalau membengkak, pecah jadi
  `memory-index.svelte.ts` + `memory-suggestions.svelte.ts` **sebelum** 500
- `embed/mod.rs` + `embed/onnx.rs` + `embed/provider.rs` + `embed/vector.rs`
- `mcp/http.rs` + `mcp/net.rs` terpisah dari `mcp/mod.rs`

---

## 9. Keputusan atas pertanyaan terbuka

Ketiga pertanyaan **sudah diputuskan** (2026-09-30). Tidak ada pekerjaan lanjutan
yang tertunda: pemicu ANN dicatat sebagai catatan, bukan tugas.

- **#Q1 — Section `Memory` sendiri** (bukan digabung ke `AI`). Alasan: embedder,
  status index, jumlah vektor, tombol rebuild, ambang, dan ukuran klaster adalah
  konfigurasi berat yang berbeda dari "kunci chat"; Constella pun memisahkan
  *Memory SDK* dari chat; dan memisahkannya menjaga `AiSettings.svelte` tetap di
  bawah batas LOC.
- **#Q2 — Preferensi lewat `metaRepo`, token terpisah.** Nilai memory (embedder
  terpilih, ambang, ukuran klaster) kecil, tidak relasional, tidak perlu
  di-query → kunci `meta:memory/*` sudah cukup dan menghindari migrasi/repo/store
  yang tidak perlu. **Token remote MCP** tetap butuh tabel/kolom sendiri
  (migrasi 22) karena rahasia + rotasi + lifecycle. Semuanya **device-local**.
- **#Q3 — ANN tidak dibangun; ukur hanya bila ada keluhan nyata.** Data komunitas
  menunjukkan mayoritas mutlak user punya **< 300 note**, median serius
  ~1.000–4.000, dan pengguna berat 5.000–18.000 — bahkan stress-test resmi
  Obsidian hanya 20.000. Pada rentang itu brute-force cosine ber-dim 384 berjalan
  **~0,3 ms (1.000 note) s.d. ~7 ms (18.000 note)**, dengan akurasi **100%**
  (ANN justru menurunkan recall ke ~90–95%). Maka: **jangan bangun ANN, jangan
  benchmark skenario yang tak dialami siapa pun.** Plafon 40.000
  (`mcp-types.ts:232–233`) **dipertahankan sebagai jaring pengaman**, bukan
  target. Pemicunya dicatat supaya tidak lupa: **ukur hanya jika ada user
  melaporkan lag**, dan saat itu barulah skenario berarti. Lihat #D19.

---

## 10. Roadmap

| Fase | Isi | Definisi selesai |
|---|---|---|
| **1a** | Migrasi 19; `Embedder` trait + `MockEmbedder`; codec & hashing; repo; `ai_embed` | Test hijau tanpa model; index bisa dibangun dari mock |
| **1b** | `OnnxEmbedder` (feature flag) + unduhan model + `MemorySettings.svelte` | User bisa mengaktifkan memory & membangun index lokal |
| **1c** | `ProviderEmbedder` + tool `semantic_search`/`related_notes` + `context` diperkaya | Chat & MCP bisa retrieval makna |
| **2a** | `graph_suggestions` (migrasi 20) + `semantic.ts` anti-spam + kartu Accept/Reject di graph | Usulan muncul dan bisa diterima/ditolak |
| **2b** | `clusters.ts` (migrasi 21) + legenda tema (`list_themes`) | Tema terlihat di graph |
| **2c** | `contradictions.ts` + kartu Contradicts (`find_contradictions`) | Pasangan bertentangan terverifikasi & bisa ditindak |
| **3a** | Import markdown + dialog | Vault Obsidian masuk tanpa kehilangan wikilink |
| **3b** | Remote MCP HTTP (Plus/Pro): listener + mode Local/LAN + token + Settings + audit | Mode Local & LAN bekerja; `claude mcp add --transport http` sukses dari mesin sendiri dan dari mesin lain di LAN; token dirotasi saat berpindah mode; `Host`/`Origin` divalidasi |

**Fase 1 adalah prasyarat 2.** Fase 3 independen.

---

## 11. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Model lokal besar → installer/binary membengkak | Model **tidak** dibundel; diunduh sekali ke `app_data_dir()`; Cargo feature `local-embed` bisa dimatikan |
| Biaya token provider saat backfill besar | Batch + `content_hash` (hanya yang berubah), batas per siklus, tombol Stop; default embedder = lokal |
| Graph jadi hairball karena usulan | #D7 (tidak pernah auto-tulis) + #D8 (anti-spam + batas N) |
| False positive kontradiksi merusak kepercayaan | Verifikasi LLM + ambang + **selalu** keputusan user; kartu menampilkan kutipan kedua sisi |
| Index basi membingungkan | Status "stale" eksplisit di Settings; tombol Rebuild; #D6 |
| Remote MCP jadi permukaan serangan | Default loopback; LAN **opt-in eksplisit** dengan peringatan; bind interface privat (bukan `0.0.0.0`); rotasi token tiap ganti mode; rate limit; `Host`/`Origin` divalidasi; audit `remote_addr`; kill switch di rail; Plus/Pro; tetap satu pintu tulis (#D12) |
| Drift registry TS↔Rust | `mcp-tools.test.ts` diperluas (#D18) |
| Beban UI saat indexing | Batch + idle + cancellable + satu window (#D16) |

---

## 12. Riwayat keputusan

| # | Keputusan |
|---|---|
| D1 | Enam fitur, tiga fase, Fase 1 prasyarat Fase 2 |
| D2 | Index vektor persisten, bukan LLM baca-semua |
| D3 | Embedder hibrida: ONNX lokal (Free) atau provider BYOK |
| D4 | Vector store di SQLite (`embeddings` BLOB), bukan DB terpisah |
| D5 | Satu baris vektor per entity + `model` + `content_hash` |
| D6 | Index adalah turunan, selalu bisa dibangun ulang |
| D7 | Auto-link hanya mengusulkan (`graph_suggestions`), tidak menulis graph |
| D8 | Anti-spam: skip beredge, skip rejected, batas N, dedup tak berarah |
| D9 | Clustering lokal (k-means), label LLM opsional dengan fallback TF |
| D10 | Contradiction = kandidat mirip + verifikasi LLM + keputusan user |
| D11 | Tool semantic ditambah di samping `search_notes`, bukan menggantikan |
| D12 | Remote MCP: HTTP, tiga mode eksposur (Local/LAN/Tunnel), Bearer, rotasi token, opt-in Plus/Pro |
| D13 | Remote MCP Plus/Pro; memory tetap gratis (lokal/BYOK) |
| D14 | Import markdown non-destruktif via `notesRepo.upsert` |
| D15 | Vektor tidak pernah masuk snapshot MCP; tool dieksekusi di app |
| D16 | Index jalan di satu window, batch, cancellable |
| D17 | Degradasi berjenjang; fitur menambah, tidak menggantikan |
| D18 | Registry dua sisi dijaga test, termasuk tool baru |
| D19 | Anti-overengineering: tanpa ANN, tanpa rayon, tanpa chunking di V1 — brute force cukup untuk ~99% user (< 1 ms) |


---

## 13. Catatan implementasi (2026-09-30, setelah dibangun)

Bagian ini mencatat **di mana implementasi menyimpang dari rencana di atas**, dan
keputusan yang diambil saat menulis kode. Semua keputusan arsitektur #D1–#D19 tetap
berlaku; yang berubah hanya detail yang tidak diputuskan di dokumen.

### 13.1 Lokasi modul Rust

- **Remote MCP tinggal di `src-tauri/src/remote_mcp/`, bukan `src-tauri/src/mcp/`.**
  `src-tauri/src/mcp/` adalah **bin** shim stdio, bukan modul lib. Listener HTTP
  harus berjalan di dalam proses app agar bisa memakai jembatan job yang sama
  (`mcp_host.rs`), jadi ia tidak bisa tinggal di shim. `protocol.rs` dan
  `registry.rs` di-`#[path]`-include dari shim sehingga tetap satu registry.
- **`src-tauri/src/embed/`** menyatukan embedder: `mod.rs` (trait), `hashing.rs`,
  `provider.rs`, `vector.rs`, `commands.rs`, dan `onnx/` (vendored) di balik
  feature `local-embed`.

### 13.2 ONNX: default, vendor, dan penyediaan dylib

- **`local-embed` sekarang ON secara default** (`default = ["local-embed"]`),
  bukan off. Alasan: desain menetapkan model lokal sebagai jalur Free default,
  dan feature yang off berarti user biasa tidak pernah mendapatkannya. CI cepat
  memakai `--no-default-features`.
- **`onnxruntime.dll` tidak di-commit.** `scripts/setup-onnx.cjs` menyalinnya dari
  `ORT_DYLIB_PATH`, instalasi Python `onnxruntime`, build sibling, atau mengunduh
  rilis resmi. Dijalankan dari `beforeDevCommand`/`beforeBuildCommand`.
- **Model tidak pernah dibundel** (sesuai #D5): `memory_download_model` mengunduh
  MiniLM-L6 (~23 MB) ke `<app_data_dir>/models/` saat pertama dipakai, dan
  `memory_model_status` melaporkan kesiapan agar UI menampilkan tombol Unduh.
- **Di Windows dylib ikut bundle** lewat `tauri.windows.conf.json`
  (`bundle.resources`), mendarat di samping exe — tepat tempat `discover_dylib()`
  mencarinya. Platform lain memakai `ORT_DYLIB_PATH` atau penempatan manual.
- **Degradasi tetap berlaku (#D17):** dylib hilang bukan error fatal; aplikasi
  tetap jalan dan model melaporkan "unavailable".

### 13.3 Jalur provider

- **Embedding provider hanya OpenAI-compatible.** Anthropic tidak punya endpoint
  `/embeddings`, jadi provider embedding tidak ditawarkan untuk provider itu.
- Panggilan `/embeddings` adalah JSON sekali-jalan (bukan SSE), jadi ia tinggal
  di `embed/provider.rs`, terpisah dari stack streaming chat di `ai/`.

### 13.4 Yang belum diverifikasi menyeluruh

- **Remote MCP HTTP (Fase 3b) belum diuji end-to-end** dengan klien MCP nyata.
  Logika keamanan murni (`net.rs`) dan listener-nya teruji/compile, tetapi
  `claude mcp add --transport http` terhadap endpoint yang berjalan belum
  dijalankan. Perlakukan sebagai "terimplementasi, belum terbukti".
- **Baseline `hashing:trigram-v1` bukan semantic.** Ia lexical, dipakai supaya
  pipeline bisa dijalankan tanpa setup dan di CI, dan UI melabelinya sebagai
  baseline (#D2).