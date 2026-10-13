# Second Brain AI — Product Backlog & Engineering Tickets

Dokumentasi tiket pengembangan (*engineering backlog*) untuk evolusi Second Brain AI, disusun berdasarkan prioritas dan kesiapan teknis.

---

## 📋 Ringkasan Tiket

| ID | Judul Tiket | Kategori | Prioritas | Estimasi | Status |
|---|---|---|---|---|---|
| **SB-01** | Halaman Detail Memori (`/memory/[id]`) & Copy Snippet | Web UI | **P1 (Tinggi)** | M (3 SP) | ✅ Done |
| **SB-02** | Form Capture & Buat Memori Baru dari Web UI | Web UI / Bridge | **P1 (Tinggi)** | M (3 SP) | 📝 Ready |
| **SB-03** | Edit, Retag, & Delete / Archive Memori | Web UI / Core | **P2 (Sedang)** | S (2 SP) | 📝 Ready |
| **SB-04** | Visualisasi Relasi Antar-Memori di 3D Graph (`relations` table) | 3D Graph / Core | **P2 (Sedang)** | M (3 SP) | 📝 Ready |
| **SB-05** | Hybrid Semantic Search (Vector Embedding + Full-Text) | AI Core / Search | **P1 (Tinggi)** | L (5 SP) | 📝 Ready |
| **SB-06** | "Ask Second Brain" AI Chat Tab (RAG Q&A Assistant) | AI / Web UI | **P2 (Sedang)** | L (5 SP) | 📝 Ready |
| **SB-07** | Multi-Device Sync & Encrypted Backup (`secondbrain sync`) | CLI / Infra | **P3 (Rendah)** | M (3 SP) | 📝 Ready |
| **SB-08** | Export to Markdown Vault (Obsidian / Notion Compatible) | Core / Tooling | **P3 (Rendah)** | S (2 SP) | 📝 Ready |

---

## 🎯 Milestone 1: Web Memory Management (CRUD & Detail)

### [SB-01] Halaman Detail Memori (`/memory/[id]`) & Copy Snippet
- **Tipe**: Feature / UI
- **Prioritas**: P1 (Tinggi)
- **Status**: ✅ Selesai
- **Deskripsi**: Saat ini memori hanya tampil sebagai kartu ringkas di dashboard atau tooltip di 3D graph. Pengguna memerlukan halaman penuh untuk membaca detail masalah, akar masalah, langkah verifikasi, daftar file, dan menyalin solusi kode dengan 1 klik.
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - [x] Rute dinamis `/memory/[id]` dapat diakses dari klik item di dashboard, daftar project, dan 3D inspector.
  - [x] Menampilkan metadata lengkap: Project, Agent, Tanggal, Tipe (bug_fix, feature, note), Tags, dan Git Commit hash.
  - [x] Merender format konten Markdown dengan syntax highlighting untuk blok kode.
  - [x] Menampilkan daftar `files` yang terasosiasi dengan memori tersebut.
  - [x] Tombol "Copy Solution / Snippet" yang menyalin teks solusi ke clipboard.
  - [x] Navigasi breadcrumb kembali ke Dashboard atau Project bersangkutan.
- **File Terdampak**:
  - `web/src/app/memory/[id]/page.tsx` (baru)
  - `web/src/lib/db.ts` (tambah method `getMemoryById(id)`)
  - `src/secondbrain/bridge.py` (tambah action `get_memory`)
  - `web/src/app/globals.css`

---

### [SB-02] Form Capture & Buat Memori Baru dari Web UI
- **Tipe**: Feature / Full-Stack
- **Prioritas**: P1 (Tinggi)
- **Deskripsi**: Memungkinkan pengguna mencatat memori/solusi secara manual langsung dari browser tanpa harus membuka terminal atau menjalankan CLI.
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - [ ] Tombol Floating Action Button (FAB) `+ New Memory` di navigasi utama atau dashboard.
  - [ ] Modal dialog atau halaman `/memory/new` dengan input form:
    - Judul (*required*)
    - Project dropdown (pilih project yang ada atau ketik project baru)
    - Tipe (*bug_fix, feature, arch, note*)
    - Konten / Solusi (Markdown textarea)
    - Tags (input chip dengan auto-complete dari tag populer)
    - Files terlampir (opsional)
  - [ ] Validasi secret redaction tetap aktif (menjaga token/kunci API ter-redact).
  - [ ] Endpoint API `/api/memories` (POST) yang memanggil bridge Python untuk menyimpan ke SQLite.
  - [ ] Notifikasi sukses dan auto-redirect ke halaman detail memori baru.
- **File Terdampak**:
  - `web/src/app/memory/new/page.tsx` atau modal component
  - `web/src/app/api/memories/route.ts` (POST handler)
  - `src/secondbrain/bridge.py` (action `create_memory`)

---

### [SB-03] Edit, Retag, & Delete / Archive Memori
- **Tipe**: Enhancement
- **Prioritas**: P2 (Sedang)
- **Deskripsi**: Kemampuan untuk memperbaiki typo, memperbarui tag, atau menghapus/mengarsipkan memori yang sudah usang dari dashboard web.
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - [ ] Tombol "Edit" di halaman detail memori untuk memperbarui judul, konten, dan tags.
  - [ ] Tombol "Delete" dengan dialog konfirmasi keamanan (*destructive action prompt*).
  - [ ] Penghapusan juga membersihkan data di relasi tabel `relations` untuk mencegah *orphan records*.
  - [ ] Penambahan endpoint DELETE dan PUT di API route.
- **File Terdampak**:
  - `src/secondbrain/core.py` (tambah method `delete_memory`, `update_memory`)
  - `src/secondbrain/bridge.py`
  - `web/src/app/api/memories/[id]/route.ts`

---

## 🪐 Milestone 2: 3D Knowledge Graph Expansion

### [SB-04] Visualisasi Relasi Antar-Memori di 3D Graph (`relations` table)
- **Tipe**: Feature / 3D Visualization
- **Prioritas**: P2 (Sedang)
- **Deskripsi**: Database sudah memiliki tabel `relations` (`from_id`, `to_id`, `kind: reuses_pattern / depends_on / supersedes`) via perintah `secondbrain link`. Saat ini, garis link di 3D graph baru memetakan memory-to-project, memory-to-tag, dan memory-to-agent. Relasi antar-memori belum divisualisasikan.
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - [ ] Bridge `action: graph` menyertakan link antar-memori dari tabel `relations`.
  - [ ] Garis relasi antar-memori di-render dengan gaya garis khusus di Three.js (misal: garis putus-putus atau warna emas neon `#f59e0b` untuk `reuses_pattern`).
  - [ ] Inspector Drawer menampilkan daftar relasi langsung: *"Reuses pattern from: [Memory Title]"* atau *"Depended on by: [Memory Title]"* yang dapat diklik untuk melompat kamera.
  - [ ] Filter toggle di toolbar: *"Show Memory-to-Memory Links"*.
- **File Terdampak**:
  - `src/secondbrain/bridge.py` (query tabel `relations`)
  - `web/src/app/graph/GraphCanvas.tsx` (tambahkan visual link styling & packet styling)

---

## 🧠 Milestone 3: AI Engine & Semantic Intelligence

### [SB-05] Hybrid Semantic Search (Vector Embedding + Full-Text)
- **Tipe**: Core AI / Search
- **Prioritas**: P1 (Tinggi)
- **Deskripsi**: Saat ini pencarian masih memakai `LIKE %query%` SQLite. Pencarian berbasis kata persis sering gagal menemukan solusi jika kata yang digunakan berbeda (misal mencari *"login hang"* padahal catatan bertuliskan *"splash auth deadlock"*).
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - [ ] Integrasikan embedding lokal ringan (misal library `fastembed` Python menggunakan model `all-MiniLM-L6-v2` ~20MB, berjalan 100% offline tanpa API key).
  - [ ] Simpan embedding vector di tabel SQLite khusus (atau memanfaatkan ekstensi `sqlite-vec`).
  - [ ] `secondbrain search "query"` otomatis melakukan hybrid ranking (kombinasi skor kemiripan semantik kosinus + pencarian teks).
  - [ ] Command CLI: `secondbrain reindex` untuk meng-generate ulang embedding seluruh memori yang ada.
  - [ ] Search bar di Web Dashboard & 3D Graph mendukung mode pencarian semantik ini.
- **File Terdampak**:
  - `src/secondbrain/core.py`
  - `src/secondbrain/cli.py`
  - `pyproject.toml` (tambah dependency opsional `fastembed`)

---

### [SB-06] "Ask Second Brain" AI Chat Tab (RAG Q&A Assistant)
- **Tipe**: AI Feature / Web UI
- **Prioritas**: P2 (Sedang)
- **Deskripsi**: Antarmuka tanya jawab di mana developer dapat bertanya dalam bahasa alami tentang solusi masa lalu, dan sistem memberikan rangkuman berbasis pengetahuan masa lalu (*Retrieval-Augmented Generation*).
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - [ ] Tab `/ask` di navigasi web dashboard.
  - [ ] Kotak dialog percakapan interaktif (chat interface).
  - [ ] Sistem mengambil 3–5 memori paling relevan via Semantic Search, lalu merangkum jawaban melalui provider LLM (bisa local Ollama atau Google Gemini / Claude API jika user mengkonfigurasi API key).
  - [ ] Jawaban menyertakan kutipan sumber memori yang dapat diklik (*Source Citations*).
- **File Terdampak**:
  - `web/src/app/ask/page.tsx` (baru)
  - `web/src/app/api/chat/route.ts` (baru)

---

## 🔒 Milestone 4: Sinkronisasi & Ekosistem Data

### [SB-07] Multi-Device Sync & Encrypted Backup (`secondbrain sync`)
- **Tipe**: Infrastructure / CLI
- **Prioritas**: P3 (Rendah)
- **Deskripsi**: Memudahkan sinkronisasi file `brain.db` antar komputer kerja (misal laptop MacBook dan workstation kantor).
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - [ ] Perintah `secondbrain sync --remote <git-url | s3-path>` untuk melakukan push/pull cadangan terenkripsi.
  - [ ] Mekanisme deteksi konflik dua arah (*merge timestamps / dedup_hash*).
  - [ ] Kompresi SQLite snapshot gzip/zstandard.
- **File Terdampak**:
  - `src/secondbrain/cli.py`
  - `src/secondbrain/sync.py` (baru)

---

### [SB-08] Export to Markdown Vault (Obsidian / Notion Compatible)
- **Tipe**: Tooling / Interoperability
- **Prioritas**: P3 (Rendah)
- **Deskripsi**: Memungkinkan seluruh memori diekspor menjadi kumpulan file `.md` terstruktur dengan folder per-project dan tags di YAML frontmatter sehingga bisa dibuka langsung di aplikasi catatan seperti Obsidian atau Logseq.
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - [ ] Perintah `secondbrain export-vault --out ./ObsidianBrain`.
  - [ ] Setiap memori menjadi 1 file markdown dengan YAML frontmatter (tags, date, project, agent).
  - [ ] Menghubungkan relasi dengan format wikilink `[[Nama-Memori]]`.
- **File Terdampak**:
  - `src/secondbrain/cli.py`
  - `src/secondbrain/core.py`
