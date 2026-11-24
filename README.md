# Maxistrong — YouTube to Roblox Audio Uploader

Aplikasi proyek tunggal (Unified Next.js + Express) untuk mengonversi lagu tunggal, playlist, maupun YouTube Mix dan mengunggahnya langsung ke **Roblox Open Cloud** beserta manajemen permission, auto-archive, dan ekspor JSON.

---

## Fitur Utama

### 1. Upload Langsung ke Roblox Open Cloud
- **Filter Durasi Otomatis**: Lagu berdurasi lebih dari 7 menit (`> 420` detik) otomatis disaring dari hasil analisis dan antrean sesuai batas resmi Roblox Open Cloud.
- **Bitrate Efisien (Default 128 kbps)**: Default output MP3 `128 kbps` (opsional `192`, `256`, `320` kbps atau format asli) yang ringan dan cepat dimuat di server Roblox besar.
- **Autentikasi Lengkap**: Mendukung **Roblox OAuth 2.0** maupun **Open Cloud API Key** untuk akun **User** dan **Group**.
- **Metadata Otomatis & Tanpa Description**: Tag ID3 (`artist`, `album`, `composer`) otomatis diset oleh sistem, `year` otomatis mendeteksi tahun berjalan, `genre` dikosongkan, dan upload ke Roblox tidak mengisi `description`.

### 2. Bypass PlaybackSpeed Roblox
Tersedia opsi kecepatan audio untuk menyinkronkan pemutaran di Roblox Studio:
- **Normal (`1.00x`)**: `PlaybackSpeed = 1`
- **Bypass 25% (`1.25x`)**: Set `PlaybackSpeed = 0.8` di Roblox Studio
- **Bypass 50% (`1.50x`)**: Set `PlaybackSpeed = 0.667` di Roblox Studio

### 3. Auto-Permission, Auto-Archive & Scan Audio (JSON)
Tersedia dalam satu panel terpadu:
- **Auto-Permission (Multi ID)**: Mendukung target **Universe ID**, **User ID**, dan **Group ID** (multi-ID dipisah koma/spasi/baris baru) dengan izin `Use` atau `Edit`, baik otomatis setelah upload baru maupun massal untuk asset lama (**Audio**, **Animation**, **Image/Decal**, **Mesh**, **Model**, **Video**).
- **Auto-Archive Asset Moderated**: Otomatis mengarsipkan asset yang terkena moderasi (`REJECTED`/`MODERATED`) saat upload baru maupun memindai & mengarsipkan asset moderated lama di akun Roblox.
- **Scan Audio (JSON)**: Memindai daftar audio aktif di akun/grup Roblox (mengecualikan audio moderated & archived) dan mengekspor hasilnya sebagai JSON `[{ "id": "...", "name": "..." }]`.
- **Hasil Upload dalam Format JSON**: Daftar lagu yang berhasil di-upload langsung tersedia dalam format JSON (salin atau unduh `.json`).

### 4. Pemutar Preview Audio & Real-Time Progress
- Pemutar audio instan di browser sebelum proses upload.
- Pembaruan progres antrean secara *real-time* menggunakan Server-Sent Events (SSE) di `/api/jobs/:jobId/events`.
- Proteksi URL & SSRF untuk memblokir alamat internal/privat.

---

## Spesifikasi Teknis

| Komponen | Teknologi |
| :--- | :--- |
| **Runtime & Server** | Node.js, TypeScript (`tsx`), Express.js |
| **Frontend** | Next.js 16 (App Router, Static Export ke `out/`), React 19, Tailwind CSS, Lucide Icons |
| **Media Processing** | FFmpeg (`ffmpeg-static`), `yt-dlp`, `node-id3` |
| **Cloud Integration** | Roblox Open Cloud Assets API v1 & Asset Permissions API v1 |
| **Testing** | Node.js Test Runner (`tsx --test`) |

---

## Menjalankan Secara Lokal

### 1. Prasyarat
- Node.js 20+
- Python 3 + `yt-dlp` (`pip install -U yt-dlp`)

### 2. Instalasi & Build
```bash
git clone https://github.com/oyy-gus/yt-to-roblox.git
cd yt-to-roblox
npm install
npm run build
```

### 3. Konfigurasi `.env`
Buat berkas `.env` di folder root proyek:
```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5000
TEMP_DIR=./tmp
MAX_CONCURRENT_JOBS=3
MAX_PLAYLIST_ENTRIES=50
MAX_PROCESSING_DURATION_SEC=600
TEMP_FILE_EXPIRATION_HOURS=2
LOG_LEVEL=info
DEV_MOCK_MODE=false
ROBLOX_CLIENT_ID=
ROBLOX_CLIENT_SECRET=
ROBLOX_REDIRECT_URI=http://localhost:5000/api/roblox/oauth/callback
```

*(Opsional)* Letakkan berkas `cookies.txt` YouTube di folder root proyek jika diperlukan untuk autentikasi stream YouTube.

### 4. Jalankan Server Tunggal
```bash
npm start
```
Aplikasi (frontend + API backend) berjalan dalam satu server di **`http://localhost:5000`**.
