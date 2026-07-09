# Pterodash

Web dashboard buat login pakai **Panel URL + Client API Key** Pterodactyl, terus kelola server
(console live, start/stop/restart/kill, file manager, edit startup variable, lihat network
allocation) — plus tab **Preview** buat test command bot WA/Discord/Telegram dan preview website.

## Struktur

```
/api/ptero.js        <- serverless proxy ke Pterodactyl Client API (biar gak kena CORS)
/public/index.html   <- halaman connect (input panel URL + API key)
/public/dashboard.html
/public/server.html  <- console / files / startup / network / preview
/public/js/*.js
/public/css/style.css
```

## Cara jalan

1. `vercel` atau connect repo ini ke Vercel — gak perlu env var apapun buat versi sekarang,
   karena panel URL & API key disimpan di **localStorage browser**, bukan di server.
2. Buka domain vercel-nya → masukkan panel URL (`https://private.pterokudesu.web.id`) dan
   **Client API key** (`ptlc_...`, dari Account Settings → API Credentials di panel Pterodactyl —
   ini beda dari Application API key yang dipakai script PHP kamu sebelumnya).
3. Klik Connect → otomatis validasi lewat `/api/client/account` terus redirect ke dashboard.

## Kenapa gak langsung `fetch()` ke panel dari browser?

Panel Pterodactyl gak kirim header CORS yang permisif, jadi browser bakal block request
langsung dari domain Vercel kamu ke domain panel. `/api/ptero.js` jadi jembatan: terima
request dari browser (dengan header `X-Panel-Url` dan `X-Api-Key`), forward ke
`{panel}/api/client{path}`, balikin response apa adanya. Key gak pernah disimpan di server,
cuma numpang lewat per-request.

Console pakai **koneksi WebSocket langsung dari browser ke Wings** (bukan lewat proxy Vercel,
karena serverless function gak bisa nahan koneksi persisten) — token didapat lewat proxy,
tapi socket-nya connect langsung.

## Soal fitur Preview (WA/Discord/Telegram bot + Website)

Ini bagian yang jujur perlu effort tambahan di sisi bot kamu:

- **Bot preview (WA/Discord/Telegram)**: Pterodash cuma bisa jadi *client* — dia gak bisa
  otomatis "nyambung" ke session WhatsApp/Discord/Telegram bot kamu tanpa bantuan. Supaya
  tab ini beneran jalan, script bot kamu (Phoenix MD / Ourin MD / bot Discord/Telegram-mu)
  perlu expose **satu HTTP endpoint** (webhook), misalnya `POST /preview-webhook`, yang:
  - terima body `{ "command": "...", "platform": "whatsapp" }`
  - jalanin command itu lewat handler command yang sama kayak di WA/Discord/Telegram
  - balikin `{ "reply": "..." }`
  
  Endpoint itu juga harus set header CORS (`Access-Control-Allow-Origin`) supaya boleh
  dipanggil dari domain Pterodash. Begitu ada, tinggal isi URL webhook-nya di tab Preview
  (disimpan per-server di localStorage) dan simulator chat-nya langsung bisa dipakai.
  
  Ini best-practice-nya karena Claude/Pterodash gak boleh dan gak bisa embed kredensial
  session WA/Discord/Telegram di frontend — command harus tetap dieksekusi di sisi bot kamu.

- **Website preview**: cuma iframe biasa ke URL/port yang kamu isi (misal domain yang jalan
  di server itu). Kalau website-nya block iframe lewat `X-Frame-Options`, dipakai tombol
  "Open in new tab" sebagai fallback.

## Migrasi ke Supabase nanti

Sekarang credential (panel URL, API key) dan config preview per-server disimpan di
`localStorage` (lihat `public/js/api.js`, object `Store`). Pas mau publish dan pindah ke
Supabase, yang perlu diganti cuma isi `Store.save/get/clear` dan `getServerConfig/setServerConfig`
supaya baca/tulis ke tabel Supabase (misal `panel_credentials`, `server_preview_config`) alih-alih
`localStorage` — struktur data dan pemanggilannya di tempat lain gak perlu berubah.

## Yang belum diimplementasi (scope lanjutan)

- Upload file multi-part (sekarang cuma bisa create file kosong lalu edit isinya)
- Backup management, database management, schedule/cron tab
- Subuser management
- Application-API side (create/delete server) — ini beda dari Client API, kalau perlu bilang aja
