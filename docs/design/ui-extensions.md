# System Design — UI Extensions: Dari CSS ke Permukaan (tanpa eksekusi kode)

> Status: **Design draft — 18 keputusan (#X1–#X18), 2 pertanyaan terbuka (#X-Q1, #X-Q2)** (lihat §9–§11).
> Tanggal: 2026-09-30
> Scope: membuka **permukaan UI** yang bisa diperluas komunitas — bukan hanya warna/CSS — **tanpa** memuat JavaScript pihak ketiga ke dalam app.
> Dokumen terkait:
> - `docs/design/business-model.md` — temuan §1 #2 ("`ui_plugins` = tulang belakang marketplace tema"), keputusan **B4** (theme marketplace berbayar) dan **B3** (seluruh app desktop OSS). Dokumen ini **mengunci** arti "marketplace" (X3, X10, X12).
> - `docs/design/mcp-local-free.md` — pola tabel → repo(`boolean`) → store `.svelte.ts` → komponen Settings (temuan 11) yang dipakai ulang di sini; §13a tentang backup & hard delete (dipakai X13).
> - `docs/design/constella-features.md` — #D18 (registry dua sisi dijaga test) adalah preseden untuk "manifest ↔ tipe app dijaga test" di sini.
> - `AGENTS.md` — aturan file (≤300/500 LOC), i18n (`t()` + locale per fitur), migrasi (tidak boleh mengedit yang sudah jalan), dan **"jangan bicara `import()` pihak ketiga"**.
> - `docs/design/journal.md` — bentuk dokumen fitur kecil yang dilebur ke app; dokumen ini mengikuti kadens senada.

---

## 0. Ringkasan eksekutif

`ui_plugins` hari ini adalah **CSS + token**, dan itu memang bekerja. Tapi ia punya batas keras yang tidak bisa dilewati dengan CSS sendiri: **ia tidak bisa menciptakan permukaan UI baru.** Tidak ada cara membuat panel di header catatan, tab di Settings, tombol di dock, atau kartu di feed lewat stylesheet. Itulah batas yang user rasakan sebagai "kenapa Obsidian bisa, kita tidak".

Jawaban dokumen ini bukan "buka sandbox JS". Itu jawaban yang salah untuk aplikasi yang seluruh UI-nya Svelte 5 + Tailwind v4 + satu bundle Vite. Yang benar adalah **memisahkan dua hal yang selama ini disebut satu nama yang sama**:

1. **Extension (UI)** — plugin **mendeskripsikan** isi (slot + widget + opsi + CSS scoped). App yang **merender**. Tidak ada kode plugin yang dieksekusi. Ini yang menghapus batas keras.
2. **Tema (CSS)** — `ui_plugins` hari ini, tetap ada, tetap bekerja, tetap tanpa batas.

Manfaatnya bukan hanya teknis. Format deklaratif berarti sebuah extension pack **aman dimuat dari mana saja** — file zip, URL, repo GitHub — tanpa membuka permukaan eksekusi kode. Itu yang membuat janji business-model (B3/B4) tetap bisa dipegang: **kemampuan memuat = gratis di OSS; yang berbayar = discovery, kurasi, distribusi** (X3).

Hasil untuk user, konkret:

- Sebuah pack bisa menaruh **kartu "catatan terkait"** di bawah setiap catatan, **chip stats** di header, **tab baru** di Settings, **item** di dock rail, **perintah** di command palette, dan **shortcut keyboard** — masing-masing di slot yang app sediakan.
- Pack bisa **mencetak nilai runtime** (jumlah catatan, task terlambat, kata terpilih) lewat katalog *template* berisi nama-field saja — bukan ekspresi. Ini batas keamanan yang tegas dan mudah diuji.
- Pack bisa menambah **properti CSS custom** ke manifest-nya, yang app petakan ke token tema. Pack **tidak** bisa menambah `--var` sendiri.
- Pack **tidak pernah** mendapat akses jaringan, filesystem, atau mutation DB: **"satu pintu tulis"** (`mcp-local-free.md` #D2/#D4) tetap utuh, dan setiap aksi yang bisa dilakukan pack adalah aksi yang **sudah** boleh dilakukan user.

Roadmap-nya bertingkat: **F0** menyatukan tema ke Extension Manager (tanpa fitur baru), **F1** melahirkan runtime + slot murni-presentational (kartu feed, chip), **F2** membuka slot aksi (menulis lewat store), **F3** distribusi (import/share), **F4** *mungkin* runtime JS di sandbox — dan hanya kalau benar-benar dibutuhkan (X18).

> **Kalimat kunci:** kita tidak meniru Obsidian. Kita mengambil **yang membuat Obsidian terasa hidup** — permukaan yang bisa diperluas — dan membatasinya di tempat yang justru jadi keunggulan kita: tidak ada kode asing yang berjalan di mesin user, dan semua mutasi tetap lewat validasi app.

---

## 1. Kondisi kode saat ini (temuan yang membentuk desain)

Dibaca dari `src/lib/content/ui-plugin-css.ts`, `src/lib/db/ui-plugins.ts`, `src/lib/stores/ui-plugins.svelte.ts`, `src/lib/components/workspace/UiPlugins.svelte` + `UiPluginEditor.svelte` + `SettingsPanel.svelte` + `AppearanceSettings.svelte` + `WorkspaceShell.svelte` + `NotesWorkspace.svelte` + `VaultRail.svelte` + `NotesFeed.svelte` + `WorkspaceOverlays.svelte` + `CommandPalette.svelte` + `TitleBar.svelte`, `src/lib/components/overlay/DockRail.svelte`, `src/lib/components/note/NoteHeader.svelte`, `src/lib/content/folder-icons.ts`, `src/lib/i18n/*`, `src/routes/layout.css`, `src-tauri/src/lib.rs`.

| # | Temuan | Implikasi ke desain |
|---|--------|---------------------|
| 1 | **`ui_plugins` sudah punya jalur lengkap**: tabel (migrasi 7) → repo yang mengembalikan `boolean` (`db/ui-plugins.ts`) → store `.svelte.ts` (hydrate/refresh/preview/save/notify lintas-window) → UI Settings. | Runtime extension **tidak boleh** membuat jalur kedua. Ia **memakai ulang** store yang sama dan menambah satu tabel lagi dengan pola identik. Ini menghapus sebagian besar pekerjaan infrastruktur. |
| 2 | **`ui_plugins` hanya menyimpan `tokens` (5 warna + radius + blur + font) dan `css`.** `tokensToCss()` mengeluarkan `:root { … !important }`. | Token map untuk extension adalah **perluasan** dari `UiPluginTokens` yang ada; jangan buat tipe token baru yang paralel. `sanitizeColor`/`sanitizeSize`/`sanitizeFont` dipakai ulang apa adanya. |
| 3 | **`sanitizeCss` sudah memblokir `@import` + `<style>` dan memotong di 20 KB.** Injeksi lewat `textContent` di satu `<style id="stylenotes-ui-plugins">`. | Paket CSS extension **wajib** lewat `sanitizeCss` yang sama, lalu di-*scope* (X9). Jangan tambah tag `<style>` kedua dengan aturan sanitasi berbeda. |
| 4 | **Theme diterapkan sebagai `html` class/`data-*`** (`applySettings` di `stores/settings.svelte.ts`) dan token Material 3 didefinisikan di `src/routes/layout.css` (`:root`, `.dark`, `html[data-accent]`, `html[data-density]`). | Extension yang ingin memakai token tema **sudah** mendapatkannya gratis (mereka mewarisi `html`). Ini alasan lagi untuk **memakai ulang komponen `base/*`**, bukan markup sendiri. |
| 5 | **`SettingsPanel.svelte` memakai array `nav` + blok `{#if section === …}`** (baris 54–63 & 137–309). Menambah tab = satu baris array + satu blok. | Slot `settings.tab` **tidak** butuh router baru. Baca tab dari store, render secara dinamis di akhir array. |
| 6 | **`isCustomFolder(id)` sudah ada** untuk memisahkan folder bawaan dari buatan user. | Slot `vault.folderItem` dipakai untuk **override item folder bawaan/apa pun**, tapi hanya mengubah presentasi. Logika folder tetap milik `VaultRail`. |
| 7 | **`FolderRow.svelte` menerima `icon` + `toneClass` sebagai prop**; `folder-icons.ts` sudah punya **whitelist aman `id → Lucide component`** dengan `resolveFolderIcon()`. | Whitelist ikon **sudah ada bentuknya**. Ekstensi ikon cukup menjadi **superset** dari daftar ini (X6), dan `FolderRow` tidak perlu tahu apa-apa tentang extension. |
| 8 | **`WorkspaceShell.svelte` merender section secara statis**: `{#if section === 'graph'} … {:else if 'tasks'} … {:else} <NotesWorkspace>`. Section id dibatasi `type WorkspaceSection = 'notes'\|'tasks'\|'graph'` di `windows.ts`. | Slot `workspace.section` adalah perubahan **paling berisiko** (lihat X14): section baru harus di luar union ini, atau union diperluas, dan `NAVIGATE_EVENT` ikut terdampak. Karena itu ia **diparkir ke F3**, bukan F1. |
| 9 | **`CommandPalette` menerima `actions: Action[]` sebagai prop**, dan `WorkspaceOverlays` menyusun action bawaan (`new`, `new-folder`, `tasks`, `graph`, `theme`, `settings`, `export`). | Slot `palette.actions` murah: cukup `[...actions, ...extensionActions]`. Tidak ada perubahan pada `CommandPalette`. |
| 10 | **`DockRailItems.svelte` merender daftar item secara statis** (`{#each notes}` + divider + `{#each tasks}`). | Slot `dock.railItem` **tidak** menyisipkan di tengah daftar (ia adalah render list milik app); extension menambah **blok item sendiri** sebelum tombol `+` (X15). |
| 11 | **`NoteHeader.svelte` punya baris chip/folder + baris tag + baris status** (`EditorStatus`, `AiEditorAssist`). | Slot `note.header` (sebelum title) dan `note.footer` (setelah body) adalah tempat yang secara visual masuk akal; jangan menaruh di dalam `NoteEditorBody`, yang memiliki logika caret/scroll. |
| 12 | **Store lintas-window memancarkan event** (`UI_PLUGINS_CHANGED`, `SETTINGS_CHANGED`, dst.) lewat `emit` Tauri. | Store extension mengikuti pola yang sama; tidak ada mekanisme sinkronisasi baru. |
| 13 | **`createNoteActions(notify)` adalah satu-satunya jalur export/print/copy**, dan `mcp-write-actions.ts` adalah satu-satunya jalur tulis tervalidasi. | Aksi extension **tidak** menambah jalur tulis. Ia memanggil operasi app yang sudah ada. Untuk F1, aksi bahkan **tidak ada** (X13). |
| 14 | **i18n**: setiap string user-facing lewat `t()`, English = schema (`DeepString<typeof en>`), locale per fitur, dan `i18n.test.ts` menolak terjemahan yang identik dengan English kecuali di whitelist. | Judul/label extension adalah **data**, bukan kunci i18n. Ia **tidak boleh** muncul di bundle locale; sebaliknya App **tidak boleh** mem-`t()`-kan string dari pack (X11). |
| 15 | **`layout.css` adalah Tailwind v4 `@import`** — tidak ada kompilasi runtime. | CSS extension **tidak bisa** memakai utility class Tailwind (`bg-surface-container` dsb.) karena utility itu tidak dikompilasi untuk pack. Ini **konsekuensi keras**: pack hanya boleh memakai **CSS custom property tema** (X9). Komponen `base/*` dipakai kalau pack ingin tampilan konsisten — itu jalan yang benar. |
| 16 | **`marked` + `dompurify` sudah ada** dan dipakai untuk merender markdown di preview & jawaban AI (dengan `renderNoteHtml` → `renderNotePreviewHtml`). | Slot `note.footer` boleh meminta **komponen markdown** yang dirender lewat pipeline yang sama. Nol ketergantungan baru; batas sanitasi sama dengan yang sudah dipercaya. |
| 17 | **`workspace` window selalu hidup** (hide-on-close + tray); detail window `note-*`/`task-*` di-`destroy()` saat tutup. | Eksekutor aksi extension (F2) hanya boleh window yang selalu hidup. Sama persis dengan batasan `mcp-host.svelte.ts`. |
| 18 | **`mcp-local-free.md` #D16 memberi preseden**: tool tulis yang menyentuh tulisan user tanpa pemulihan wajib punya backup dulu (`mcp_backup_note`). | Aksi extension yang menghapus/mengganti isi catatan harus memakai jalur backup yang sama di F2 (X13). |
| 19 | **Batas file keras 500 LOC.** `WorkspaceShell`, `SettingsPanel`, `DockRail` sudah besar. | Modul baru dipecah sejak awal: `content/extension-manifest.ts` (parse/validate), `content/extension-slots.ts` (katalog slot + widget), `content/extension-templates.ts` (katalog nilai runtime), `db/extensions.ts`, `stores/extensions.svelte.ts`, `components/extensions/*.svelte`. |
| 20 | **`package.json` `"license": "MIT"`, belum ada `LICENSE`, `CONTRIBUTING.md`, `.github/`** (business-model temuan 7). | Marketplace extension **butuh** kerangka OSS ini hidup dulu: tanpa `LICENSE`/CLA, karya pihak ketiga tidak bisa didistribusikan ulang oleh app (X12 adalah pertanyaan terbuka yang menahan F3). |

---

## 2. Arsitektur

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Extension pack  (data, bukan kode)                                          │
│                                                                              │
│   ui-extension.json          ← manifest: slot, widget, opsi, template, css    │
│   (opsional) locale/*.json   ← label pack sendiri (jarang; default = string)  │
│   (opsional) preview.png     ← untuk daftar/toko                               │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │  dibaca, di-parse, DITOLAK kecuali bentuknya sah
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  StyleNotes (Tauri, Svelte 5 + Tailwind v4)                                  │
│                                                                              │
│  content/extension-manifest.ts   parse + validate (murni, teruji Vitest)      │
│  content/extension-slots.ts      katalog slot + widget + prop schema          │
│  content/extension-templates.ts  katalog nilai runtime ({count} dsb.)         │
│                 │                                                            │
│                 ▼                                                            │
│  stores/extensions.svelte.ts  ← hydrate / enable / reorder / preview / save   │
│         │            │                    (meniru ui-plugins.svelte.ts)      │
│         │            └───────────────► emit EXTENSIONS_CHANGED (lintas-window)│
│         ▼                                                                    │
│  components/extensions/ExtensionSurface.svelte   ← SATU renderer              │
│         │   memilih widget dari katalog, memberi nilai dari context           │
│         ▼                                                                    │
│  Slot di seluruh app:                                                        │
│    workspace.feedCard · note.header · note.footer · dock.railItem            │
│    settings.tab · palette.actions · statusBar                                │
│                                                                              │
│  (F2) Aksi → OPERASI APP YANG SUDAH ADA                                      │
│       updateNote / removeTask / toggleArchive / openNoteInWindow / …          │
│       ← tidak ada jalur tulis baru; "satu pintu tulis" tetap utuh             │
└──────────────────────────────────────────────────────────────────────────────┘

Tema (CSS) tetap lewat jalur lama:
  UiPlugins.svelte → ui-plugins.svelte.ts → buildPluginCss → <style textContent>
```

### Komponen baru

| Komponen | Teknologi | Tanggung jawab |
|---|---|---|
| `src/lib/content/extension-manifest.ts` | TS murni | Tipe manifest + `parseManifest`/`normalizeExtension` + limit ukuran. **Teruji Vitest.** |
| `src/lib/content/extension-slots.ts` | TS murni | Katalog slot, widget per slot, prop schema, `isValidForSlot()`. **Teruji.** |
| `src/lib/content/extension-templates.ts` | TS murni | Katalog template nilai runtime (`{count}`, `{title}`…) + `resolveTemplate()`. **Teruji.** |
| `src/lib/content/extension-css.ts` | TS murni | Scope CSS pack ke slot (X9) di atas `sanitizeCss`. **Teruji.** |
| `src/lib/db/extensions.ts` | TS | Repo `ui_extensions` (return `boolean`, meniru `db/ui-plugins.ts`). |
| `src/lib/stores/extensions.svelte.ts` | Svelte 5 runes | Hidrasi, enable, urutan, cascade (X7), emit lintas-window. |
| `src/lib/components/extensions/ExtensionSurface.svelte` | Svelte | **Renderer tunggal**: slot id → daftar extension → widget. |
| `src/lib/components/extensions/widgets/*.svelte` | Svelte | Satu file per widget katalog (≤300 LOC masing-masing). |
| `src/lib/components/extensions/ExtensionIcon.svelte` | Svelte | Memetakan nama ikon whitelist → komponen Lucide. |
| `src/lib/components/workspace/ExtensionsSettings.svelte` | Svelte | Tab Settings "Extensions" (F0: gabungkan UI tema ke sini). |
| `src/lib/components/dialogs/ImportExtensionDialog.svelte` | Svelte | Tempel/unggah manifest, pratinjau, konfirmasi izin (F3). |
| Tabel `ui_extensions` | Migrasi baru | Lihat §5. |

> **Tidak ada komponen per-slot.** Slot adalah *prop* dari `ExtensionSurface`, bukan komponen sendiri. Ini yang menjaga jumlah file tetap kecil.

---

## 3. Keputusan arsitektur

### X1 — Pemisahan tegas: Extension (permukaan) vs Tema (CSS)

**Keputusan:** istilah "plugin" yang sekarang dipakai `ui_plugins` **tidak diubah** (kompatibilitas + sudah dipakai di kode), tapi UI baru memakai nama **Extension** untuk permukaan dan **Theme** untuk CSS.

| Istilah lama | Istilah baru di UI | Data |
|---|---|---|
| UI plugin (tokens+css) | **Tema** | `ui_plugins` (tetap) |
| — | **Extension** | `ui_extensions` (baru) |

Alasan: user harus bisa membedakan "yang mengubah warna" dari "yang menambah panel". Sekarang keduanya disebut hal yang sama, dan itu membuat janji "plugin" terasa palsu.

### X2 — Extension adalah **data**, bukan kode (batas yang mengunci semua keputusan lain)

Manifest adalah JSON. App **tidak pernah** `eval`, `new Function`, `import()`, atau memasang `<script>`. Tidak ada `onclick`, tidak ada ekspresi, tidak ada `href` bebas.

**Konsekuensi jujur:** di F1 extension tidak bisa "melakukan" apa pun selain tampil. Itu batas yang **disengaja**. Keuntungannya: install = membaca file; uninstall = hapus baris; tidak ada supply-chain attack yang lolos lewat pack.

**Kenapa ini bukan kekurangan:** 80% nilai komunitas Obsidian adalah *memperlihatkan informasi* (backlink panel, stats, dataview, calendar heatmap). Bagian "melakukan" datang dari integrasi — dan integrasi StyleNotes sudah punya jalur **yang lebih baik** daripada plugin: **MCP** (X17).

### X3 — Batas gratis/berbayar tetap business-model; dokumen ini hanya mengunci artinya

- **Memuat & memakai extension = gratis, tanpa batas** (B3: app desktop OSS).
- **Yang berbayar = toko / kurasi / distribusi pack** — bukan slot, bukan jumlah extension aktif.

Konsekuensi desain: **jangan pernah** menaruh slot di balik entitlement. Kalau sebuah slot hanya berguna kalau ada extension pihak ketiga, dan pack-nya hanya ada di toko berbayar, itu **distribusi** yang berbayar — bukan runtime. Klien OSS tetap harus bisa memuat pack yang sama dari file lokal.

### X4 — Katalog slot (tetap, sempit, dan di-render app)

Slot adalah **daftar tertutup**. Menambah slot = perubahan kode + rilis, bukan fitur manifest.

| Slot | Muncul di | Fase | Posisi render |
|---|---|---|---|
| `workspace.feedCard` | `NotesFeed` (kartu catatan) | F1 | Setelah `note.excerpt` |
| `note.header` | `NoteHeader` | F1 | Sebelum baris title |
| `note.footer` | `NoteEditor` (setelah body) | F1 | Setelah `NoteEditorBody` |
| `statusBar` | `NoteHeader` baris status | F1 | Sebelah `EditorStatus` |
| `dock.railItem` | `DockRailItems` | F1 | Blok item sendiri, sebelum tombol `+` |
| `palette.actions` | `CommandPalette` | F1 | Digabung ke `actions` |
| `settings.tab` | `SettingsPanel` | F2 | Tab dinamis di akhir `nav` |
| `workspace.section` | `WorkspaceShell` | F3 | Diparkir (X14) |

Setiap slot punya **widget yang diizinkan** (X5) dan **context objek** (data apa yang tersedia). Slot tanpa context (mis. `statusBar`) tidak menerima `note`/`task`; ini dinyatakan di katalog, bukan di tebakan pack.

> **Aturan:** slot **tidak pernah** mengizinkan pack menggantikan komponen app. `note.header` *menambah*, bukan mengganti. Ini berbeda dari Obsidian (di sana plugin mengganti view) dan itu keputusan sadar: identitas visual app tidak boleh hilang oleh pack.

### X5 — Widget adalah inventory app (pack memilih, app merender)

Katalog widget awal (F1):

| Widget | Slot yang mengizinkan | Props | Nilai runtime |
|---|---|---|---|
| `heading` | semua | `text`, `level` | ya |
| `text` | semua | `text`, `muted?` | ya |
| `markdown` | `note.footer`, `workspace.feedCard` | `text` | ya |
| `chipRow` | semua | `chips: {text, icon?, tone?}[]` | ya (per chip) |
| `badge` | semua | `text`, `tone` | ya |
| `kvRow` | semua | `rows: {label, value}[]` | ya (per value) |
| `divider` | semua | – | – |
| `list` | semua | `items: {name, icon?, meta?}[]`, `emptyText?` | ya |
| `progress` | `workspace.feedCard`, `statusBar` | `value`, `max` | ya |
| `iconButtonRow` | `note.header`, `dock.railItem` | `buttons: {icon, actionId, label}[]` | – (F2) |
| `separator` | semua | – | – |

`iconButtonRow` adalah satu-satunya widget yang **butuh aksi**; ia otomatis tidak muncul di F1 (X13).

### X6 — Ikon dari whitelist yang sudah ada (superset `folder-icons.ts`)

Pack memilih **nama** ikon, bukan komponen. App memetakan lewat whitelist.

```jsonc
{ "icon": "sparkles" }        // → Sparkles dari @lucide/svelte
{ "icon": "not-real" }        // → diabaikan, widget tetap render tanpa ikon
```

Whitelist awal = `folderIcons` (24 nama) + sekitar 20 nama tambahan yang relevan untuk panel (`link`, `clock`, `tag`, `calendar`, `list-checks`, `hash`, `eye`, `search`, `filter`, `sort`, `arrow-up-right`, `star`, `pin`, `history`, `database`, `folder-tree`, `bookmark`, `bell`, `check`, `x`). **Daftar ini adalah satu file**, `content/extension-icons.ts`, dan test memastikan tidak ada nama di manifest test fixture yang jatuh ke `undefined`.

**Kenapa bukan `import()` dinamis:** itu sama dengan menjalankan kode dari data. Whitelist statis juga berarti Vite tetap bisa tree-shake ikon yang tidak dipakai (bundle tidak membengkak karena pack menyebut ikon acak).

### X7 — Cascade & prioritas diputuskan, bukan diwariskan dari CSS

`ui_plugins` sekarang "yang paling bawah menang" karena `!important` + urutan `<style>`. Itu **tidak cukup** untuk extension yang menambahkan *dom*, bukan menimpa *gaya*.

**Keputusan (X7):** urutan eksekusi **deterministik dan eksplisit**.

1. Urutkan extension aktif berdasarkan `position` ASC.
2. Untuk slot **aksi** (`palette.actions`, `dock.railItem`): tampilkan **semua** contributor. Tidak ada pemenang.
3. Untuk slot **tampilan** (`note.header`, `note.footer`, `statusBar`, `workspace.feedCard`): tampilkan **semua** contributor, tetapi tiap widget merekam `data-extension="<id>"` supaya (a) UI bisa menandainya "dari {name}" saat debug/preview dan (b) konflik bisa dipecahkan user dengan menyembunyikan salah satu.
4. **Tidak ada "last wins" implisit.** Kalau dua pack menaruh kartu di `note.footer`, dua kartu muncul. Alternatif "yang terakhir menang" membuat kerja pack hilang tanpa pesan — lebih buruk.

Ini juga mengubah cara pandang tema: dokumen ini **tidak** mengklaim tema berubah; tema tetap "paling bawah menang" (CSS), dan itu tetap didokumentasikan seperti sekarang.

### X8 — Spesifisitas & `!important` tema tetap milik app

Extension **bukan** tempat untuk mengganti gaya app. Kalau pack menganjurkan `body { … }` di CSS-nya, itu harus gagal atau di-scope.

**Keputusan:** `extension-css.ts` meng-*prefix* setiap rule pack dengan `[data-ext="<id>"]` (dan tidak mengizinkan `:root`, `html`, `body` sebagai target langsung — lihat X9). `!important` tidak dihapus karena pack mungkin sengaja memakai-nya di dalam scope-nya sendiri; yang dicegah adalah **keluar dari scope**.

### X9 — CSS pack hanya boleh memakai CSS custom property; token map adalah satu-satunya writer

Tailwind utility **tidak tersedia** untuk pack (temuan 15). Jadi:

- Pack **boleh** memakai: `var(--color-surface-container)`, `var(--primary)`, dst. — token yang sudah ada.
- Pack **boleh** menulis `color`/`padding`/`gap`/… di dalam scope-nya.
- Pack **tidak boleh** mendeklarasikan `--var` baru dan mengharapkannya bekerja di luar scope-nya (`:root` diblokir di X8).
- Pack yang ingin menambah **token baru** harus mendeklarasikannya di manifest `tokens` (X10), yang app petakan ke token CSS resmi.

Alasan: ini mencegah pack "membajak" variabel app (mis. `--glass-blur`) sehingga pack lain atau app sendiri rusak. Token resmi adalah **kontrak**.

### X10 — Token map adalah perluasan `UiPluginTokens`

```jsonc
"tokens": {
  "primary": "#7fd4c1",          // sanitizeColor
  "surface": "#161b23",          // sanitizeColor
  "radius": 14,                  // sanitizeSize(0..24)
  "glassBlur": 24,               // sanitizeSize(0..48)
  "fontFamily": "Inter, system-ui"  // sanitizeFont
}
```

`tokensToCss()` di `ui-plugin-css.ts` **dipakai ulang apa adanya** untuk extension. Tidak ada implementasi token kedua. Konsekuensinya: paket tema dan paket extension memakai primitif yang sama, dan test `ui-plugin-css.test.ts` sudah menutupi keduanya.

### X11 — Teks pack adalah **data**, bukan kunci i18n (dan app tidak menerjemahkannya)

Setiap string di manifest (`heading.text`, `chip.text`, `label`, …) **dipakai literal**. App **tidak** mem-`t()`-nya, dan pack **tidak boleh** menaruh kunci i18n di manifest karena app tidak punya bundle-nya.

- Ini melindungi aturan i18n: `i18n.test.ts` menolak terjemahan identik dengan English; kalau string pack masuk bundle, aturan itu pecah.
- Pack yang ingin multi-bahasa menaruh **teks per locale** di manifest dan memilih saat render:

```jsonc
{ "widget": "heading", "props": { "text": { "en": "Recent notes", "id": "Catatan terbaru" } } }
```

App memilih key `settings.language`, jatuh ke `"en"`, jatuh ke nilai pertama yang ada. **Tidak ada** mesin i18n baru — hanya pemilihan key (X11).

> Aturan i18n app **tidak berubah**: `t()` tetap untuk UI app. Yang berubah hanya: kita sekarang punya kategori string baru ("teks pack") yang punya aturan sendiri, dan itu didokumentasikan di sini.

### X12 — Lisensi pack: app tidak boleh "mengadopsi" karya pihak ketiga

Ini **pertanyaan terbuka #X-Q1** dan **menahan F3**. Ringkas masalahnya:

- App menjadi AGPL-3.0 (business-model B7). Itu lisensi **source app**, bukan lisensi **aset** pack.
- Tanpa CLA di sisi pack, app tidak punya hak untuk mendistribusikan ulang karya itu (apalagi menjualnya lewat toko).
- Menganggap pack "otomatis AGPL karena dimuat app" adalah **salah** dan akan mematikan minat kontributor.

**Rekomendasi (keputusan awal, menunggu konfirmasi):** setiap pack **wajib** punya field `license` di manifest, dan pack **tidak** dianggap bagian app. Toko (kalau ada) hanya meng-host, tidak mere-license. Detail di §9.

### X13 — Batas F1: **permukaan murni presentasional**

F1 **tidak** mengizinkan aksi. Bahkan `iconButtonRow` tidak dirender di F1.

Kenapa memisahkan F1 dan F2 secara keras: kalau aksi masuk F1, kita harus memutuskan *bagaimana* aksi dipanggil di F1 juga (permission, audit, konfirmasi, backup). Itu adalah pertanyaan F2 dan menenggelamkan bagian yang sebenarnya paling sulit (render + slot + scope). Dengan memisahkannya, F1 bisa dinilai (apakah slot-nya berguna?) sebelum biaya aksi dibayar.

### X14 — Section baru di `WorkspaceShell`: **diparkir ke F3** dan butuh keputusan union terpisah

`WorkspaceSection = 'notes' | 'tasks' | 'graph'` (temuan 8). Menambah section dinamis berarti:

- union diperluas atau dibiarkan (kalau dibiarkan, `NAVIGATE_EVENT`/`state.section` yang bertipe union akan menolak id extension);
- `TitleBar`'s `SegmentedControl` juga membaca dari `sections` statis;
- `Workspace.svelte`'s `state.section = 'notes'` dsb. akan perlu penjagaan "extension section yang tidak aktif lagi".

**Keputusan:** **tidak** di F1/F2. F3 boleh menambahkannya **hanya** kalau terbukti ada permintaan nyata setelah F1 dirilis. Kalau ya, bentuk yang benar adalah `id: 'ext:<extensionId>'` yang **selalu** dipisahkan dari union `WorkspaceSection` (`type SectionId = WorkspaceSection | \`ext:${string}\``) dan `NAVIGATE_EVENT` diperlakukan sebagai string yang divalidasi. Itu pekerjaan tersendiri.

### X15 — `dock.railItem` menambah **blok**, bukan menyisipkan di tengah

`DockRailItems` adalah render list milik app (temuan 10). Extension menambah blok item sendiri **sebelum** tombol `+`. Kalau extension ingin tampil di antara note dan task, itu bukan slot — itu artinya app perlu mengubah dock menjadi slot yang lebih umum, dan itu **bukan** tujuan dokumen ini.

### X16 — Pemuatan dari file: manifest dibaca, bukan dieksekusi

F0/F1: extension hanya dibuat di dalam app (editor), sama seperti tema sekarang.

F3: import dari file/teks.

- Format: **satu file JSON** (data URL / tempel) lebih dulu. Zip (manifest + preview + css) menyusul.
- Validasi **sebelum** import: `parseManifest` → `isValidForSlot` untuk setiap entry → limit ukuran total.
- **Tidak ada** eksekusi saat import. Import = baca + validasi + simpan baris.

### X17 — Extension **tidak** menggantikan MCP; keduanya menjawab pertanyaan berbeda

| Kebutuhan | Jawabannya |
|---|---|
| "Tampilkan backlink di bawah catatan" | **Extension** (render) |
| "Pak, ringkas semua catatan di folder ini" | **AI chat + tool** (`ai-tools.ts`) |
| "Agent eksternal (Claude/Cursor) mengelola task" | **MCP** (`mcp-tools.ts`) |
| "Ubah warna/radius app" | **Tema** (`ui_plugins`) |

Kalau seorang kontributor bertanya "apakah saya harus bikin extension atau MCP server?", jawabannya: **kalau logikanya butuh jaringan/keputusan, jangan extension.** Ini mencegah ekosistem penuh "extension" yang sebenarnya adalah agent yang butuh kode.

### X18 — Runtime JS (sandbox) adalah F4 dan **hanya kalau diminta**

Kalau suatu saat benar-benar dibutuhkan, satu-satunya bentuk yang boleh dipertimbangkan adalah **`<iframe sandbox>` + postMessage** dengan API yang eksplisit, **bukan** `import()` ke bundle. Detail apa pun di luar itu adalah desain terpisah. Ini dicatat supaya keputusan hari ini tidak dibaca sebagai "JS selamanya tidak akan pernah" — tetapi juga tidak dibaca sebagai janji.

---

## 4. Alur (use case)

**A. Memasang sebuah pack (F1, dari editor dalam app).**
User membuka `Settings → Extensions` → "Extension baru" → mengisi manifest di editor (structured form: pilih slot, pilih widget, isi props) → app mem-parse + validasi → entry muncul di `ExtensionSurface` slot terkait **langsung** (preview), tersimpan setelah debounce. Persis pengalaman `UiPluginEditor` hari ini.

**B. Pack "Backlink mini" (F1).**
Manifest menaruh `list` di `note.footer` dengan `source: 'backlinks'`. Saat catatan dibuka, `ExtensionSurface` resolusi sumber dari `buildWorkspaceGraph` → daftar judul → dirender sebagai `list`. Klik judul **tidak** membuka apa pun (F1 presentational) — itu F2 (`openNoteInWindow`).

**C. Pack "Stats kanan atas" (F1).**
`statusBar` + `kvRow` dengan template `{words}` dan `{chars}` dari note yang terbuka. Nilai berasal dari `note.words`/`note.chars` yang **sudah dihitung app** (content.ts) — pack tidak menghitung apa pun.

**D. Pack "Quick print" (F2).**
`note.header` + `iconButtonRow` dengan satu tombol `actionId: 'note.print'`. Aksi dipetakan app ke `createNoteActions(notify).print(note)` — jalur yang **sudah ada** (temuan 13). Tidak ada kode pack yang berjalan; hanya id aksi yang dicocokkan ke katalog aksi app.

**E. Pack yang salah (ditolak).**
Manifest dengan widget yang tidak diizinkan slot, ikon di luar whitelist, `:root { }` di CSS, atau `@import` → `parseManifest` mengembalikan daftar error; UI menampilkan error dan **tidak** menyimpan. Pack tidak pernah "setengah aktif".

**F. Dua pack bentrok di `note.footer` (X7).**
Dua-duanya dirender, berurutan `position`. User bisa menyembunyikan salah satu dari tab Extensions (toggle enabled). Tidak ada penimpaan senyap.

---

## 5. Migrasi & skema

Satu tabel, mengikuti pola `ui_plugins` (temuan 1) — **hanya** menambah tabel, tidak pernah menyentuh migrasi yang sudah jalan.

```sql
-- migration baru (version berikutnya di src-tauri/src/lib.rs)
CREATE TABLE IF NOT EXISTS ui_extensions (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    manifest    TEXT    NOT NULL,          -- JSON: { version, entries: [...] }
    tokens      TEXT    NOT NULL DEFAULT '{}',  -- JSON: UiPluginTokens (reuse, X10)
    css         TEXT    NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 1,
    position    INTEGER NOT NULL DEFAULT 0,
    license     TEXT    NOT NULL DEFAULT '',    -- X12
    source      TEXT    NOT NULL DEFAULT 'local', -- local | file | url | store
    installed_at TEXT   NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT   NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ui_extensions_position ON ui_extensions(position);
```

- `manifest` adalah **satu kolom JSON**: extension berisi banyak entry (banyak slot/widget). Tabel `ui_extension_entries` akan menambah join demi query yang tidak pernah kita lakukan — entry selalu dibaca sebagai satu dokumen.
- `source` membedakan buatan user dari import; berguna untuk F3 (dan untuk "apa yang came from luar?").
- Mengikuti aturan repo: `db/extensions.ts` mengembalikan `boolean` untuk setiap tulis.

---

## 6. Perubahan pada modul yang ada

| File | Perubahan | Fase |
|---|---|---|
| `src/lib/components/workspace/NotesFeed.svelte` | Sisipkan `<ExtensionSurface slot="workspace.feedCard" {note} />` setelah excerpt | F1 |
| `src/lib/components/note/NoteHeader.svelte` | `<ExtensionSurface slot="note.header" {note} />` sebelum title; `<ExtensionSurface slot="statusBar" {note} />` di baris status | F1 |
| `src/lib/components/workspace/NoteEditor.svelte` | `<ExtensionSurface slot="note.footer" {note} />` setelah `NoteEditorBody` | F1 |
| `src/lib/components/overlay/DockRailItems.svelte` | Blok `<ExtensionSurface slot="dock.railItem" />` sebelum tombol `+` (X15) | F1 |
| `src/lib/components/workspace/WorkspaceOverlays.svelte` | `actions={[...baseActions, ...extensionPaletteActions]}` | F1 |
| `src/lib/components/workspace/AppearanceSettings.svelte` | `UiPlugins` **dipindah** (bukan dihapus) ke `ExtensionsSettings`, dengan komentar penghubung | F0 |
| `src/lib/components/workspace/SettingsPanel.svelte` | Satu entri `nav` `extensions`; blok `{#if section === 'extensions'}`; tab dari store | F0/F2 |
| `src/lib/components/workspace/UiPlugins.svelte` | Berubah judul jadi "Tema" (string i18n), isi sama | F0 |
| `src/lib/i18n/locales/{en,id}/settings.ts` | Bagian `extensions` baru + `nav.extensions`; `plugins` tetap | F0 |
| `src/routes/layout.css` | **Tidak disentuh** (temuan 15: tidak ada Tailwind runtime) | – |
| `src-tauri/src/lib.rs` | Satu `Migration` baru | F1 |

---

## 7. Pengujian

Semua logika baru adalah **modul murni** dan diuji Vitest (aturan repo).

| Test | Menguji |
|---|---|
| `content/extension-manifest.test.ts` | Manifest valid diterima; widget salah-slot, ikon di luar whitelist, ukuran lewat batas, `:root` di CSS → **ditolak** dengan alasan. |
| `content/extension-slots.test.ts` | Setiap widget di katalog punya daftar slot yang konsisten dua arah; `isValidForSlot` konsisten dengan slot-test-fixtures. |
| `content/extension-templates.test.ts` | `{count}`/`{title}`/`{words}` resolve dari context; field tidak dikenal → placeholder **tetap terlihat** (pola `lookup` i18n), bukan `undefined`. |
| `content/extension-css.test.ts` | CSS pack ter-scope ke `[data-ext="id"]`; `:root`/`html`/`body` ditolak; `@import` hilang (reuse `sanitizeCss`). |
| `stores/extensions.test.ts` | Urutan `position`, enable/disable, cascade X7 (dua contributor = dua render), kegagalan DB mengembalikan state. |
| `i18n` (existing) | Memastikan string pack **tidak** bocor ke bundle: test baru menegaskan `settings.nav.extensions` ada di kedua locale, dan `plugins` masih ada. |

**Tidak** diuji di F1: rendering visual slot (itu tugas manual user), karena tidak ada test browser di repo ini.

---

## 8. Loc / pemecahan file

Batas 500 LOC keras; target 300.

| File | Perkiraan | Catatan |
|---|---|---|
| `content/extension-manifest.ts` | ~200 | tipe + parse + limit |
| `content/extension-slots.ts` | ~180 | katalog (data) |
| `content/extension-templates.ts` | ~120 | katalog |
| `content/extension-css.ts` | ~120 | scope |
| `content/extension-icons.ts` | ~90 | whitelist |
| `db/extensions.ts` | ~120 | meniru `ui-plugins.ts` |
| `stores/extensions.svelte.ts` | ~250 | meniru `ui-plugins.svelte.ts` |
| `components/extensions/ExtensionSurface.svelte` | ~200 | satu renderer |
| `components/extensions/widgets/*.svelte` | 40–90 × 10 | satu per widget |
| `components/workspace/ExtensionsSettings.svelte` | ~280 | tab |

`ExtensionSurface.svelte` **tidak** boleh membengkak jadi perpustakaan widget; setiap widget adalah file sendiri. Ini yang membuat "satu renderer" tetap ≤300.

---

## 9. Keputusan atas pertanyaan terbuka

**#X-Q1 — Lisensi pack (menahan F3).**

Opsi:

| | A. `license` wajib di manifest ✅ rekomendasi | B. pack dianggap AGPL | C. bebas, tanpa field |
|---|---|---|---|
| Kontributor mau pakai MIT/CC-BY | ya | tidak (mereka harus AGPL) | ya |
| App boleh distribusi ulang | hanya kalau lisensi mengizinkan | dianggap mengizinkan | **tidak jelas** (risiko hukum) |
| Toko bisa menjual | ya, kalau lisensi mengizinkan | ya | **tidak** |

**Rekomendasi: A.** Manifest punya `license` (SPDX id, wajib di F3). Toko menampilkan lisensi sebelum install. App **tidak** mere-license. Ini konsisten B7 dan aman hukum.

**#X-Q2 — Apakah `dock.railItem` cukup, atau butuh slot dock yang lebih umum?**

Dokumen ini memilih bentuk sempit (X15). Kalau setelah F1 terbukti user ingin extension **di antara** item dock, itu keputusan tersendiri (mengubah dock jadi render list yang bisa disisipi). **Rekomendasi:** tunda sampai ada bukti, karena bentuk sempit lebih mudah dilebarkan daripada sebaliknya.

---

## 10. Roadmap

| Fase | Isi | Prasyarat |
|---|---|---|
| **F0** | Tab Settings "Extensions": `UiPlugins` dipindah ke sana (judul "Tema"), kerangka tab + i18n. **Tidak ada fitur baru.** | – |
| **F1** | Runtime extension presentasional: manifest, slot, widget, CSS scope, cascade. Tabel `ui_extensions`. Slot: `workspace.feedCard`, `note.header`, `note.footer`, `statusBar`, `dock.railItem`, `palette.actions`. | F0 |
| **F2** | Aksi: `iconButtonRow`, katalog aksi app, `settings.tab`, konfirmasi untuk aksi destruktif, backup lewat jalur `mcp-local-free.md` §13a. | F1 |
| **F3** | Distribusi: import dari file/teks, zip, lisensi (#X-Q1), `workspace.section` (X14). | F2 + infrastruktur OSS (temuan 20) |
| **F4** | (Opsional) runtime JS sandbox. | F3 + permintaan nyata |

---

## 11. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Pack membanjiri UI** (5 pack di `note.footer`) | Editor penuh, user bingung | Batas jumlah entry per slot (mis. 3) + urutan `position` + toggle per pack (X7) |
| **CSS pack merusak chrome app** | Aplikasi tidak terbaca | Scope `[data-ext]` (X8) + `:root` diblokir |
| **Pack "membajak" token** (`--glass-blur`) | Pack lain/app rusak | Token hanya lewat manifest (X10) |
| **Label pack tidak bisa diterjemahkan** | UX buruk di locale id | Manifest menerima objek `{en, id}` (X11) |
| **"Plugin" janji berlebihan** | Kepercayaan rusak | Istilah Extension vs Tema (X1) + X2 dijelaskan di UI Settings |
| **Import pack dari sumber jahat** | Supply chain | Tidak ada eksekusi (X2/X16); validasi menyeluruh; `source` disimpan |
| **Bundle membengkak** | Installer besar | Ikon whitelist statis + tree-shake (X6) |
| **Aksi destruktif lewat pack** | Kehilangan data | F2 saja; konfirmasi + backup (§13a); F1 tidak punya aksi (X13) |

---

## 12. Riwayat keputusan

| # | Topik | Keputusan |
|---|---|---|
| X1 | Istilah | Extension (permukaan) vs Tema (CSS); `ui_plugins` tetap |
| X2 | Bentuk | Extension = data JSON; tidak ada eksekusi kode |
| X3 | Bisnis | Runtime gratis tanpa batas; distribusi/kurasi berbayar |
| X4 | Slot | Daftar tertutup; menambah slot = rilis |
| X5 | Widget | Inventory app; pack memilih, app merender |
| X6 | Ikon | Whitelist statis (superset `folderIcons`) |
| X7 | Cascade | Semua contributor dirender; tidak ada last-wins implisit |
| X8 | CSS scope | Prefix `[data-ext]`; `:root`/`html`/`body` diblokir |
| X9 | CSS isi | Hanya CSS custom property tema; utility Tailwind tidak tersedia |
| X10 | Token | Reuse `UiPluginTokens` + `tokensToCss()` |
| X11 | Teks | Data pack, bukan kunci i18n; dukungan `{en, id}` |
| X12 | Lisensi | Field `license` wajib (F3); **#X-Q1** |
| X13 | Batas F1 | Presentasional saja; aksi = F2 |
| X14 | Section baru | Diparkir F3; union terpisah |
| X15 | Dock | Blok item sendiri, bukan sisip |
| X16 | Import | Baca + validasi, tidak eksekusi |
| X17 | Posisi vs MCP | Extension merender; MCP/AI mengerjakan |
| X18 | JS runtime | F4, sandbox, hanya kalau diminta |

### Keputusan terbuka
- **#X-Q1** — lisensi pack (rekomendasi: field `license` wajib).
- **#X-Q2** — perluas slot dock? (rekomendasi: tunda).
