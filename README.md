# Private QRIS Gateway

Gateway pembayaran QRIS pribadi untuk store sendiri.

## Alur

1. Store membuat order.
2. Store memanggil `POST /api/payments` dengan API key + merchant ID.
3. Gateway mengubah QRIS statis menjadi QRIS dinamis sesuai nominal.
4. Customer membayar QRIS.
5. Aplikasi Android membaca notifikasi pembayaran dan mengirim ke `POST /api/android/notifications`.
6. Alternatifnya, dashboard bisa connect WhatsApp Web dan membaca chat notifikasi seperti BRI-NOTIF.
7. Gateway mencocokkan nominal dan menandai payment sebagai `paid`.
8. Gateway mengirim callback ke aplikasi store dan akan retry otomatis kalau gagal.

## Menjalankan

```bash
cp .env.example .env
npm install
npm run seed
npm run dev
```

## Menjalankan Dengan Docker Compose

```bash
docker compose up -d --build
```

Data transaksi disimpan di folder lokal:

```text
data/gateway.json
```

Melihat log:

```bash
docker compose logs -f gateway
```

Stop:

```bash
docker compose down
```

Dashboard:

```text
http://localhost:3000/dashboard?token=change-this-admin-token
```

Jika domain gateway berubah, cukup ubah `BASE_URL` di `.env`.
Untuk menyamakan default URL aplikasi Android listener dengan `.env`, jalankan:

```bash
npm run android:sync-env
```

## Build APK Android Listener Di GitHub

Source APK ada di folder:

```text
android-listener
```

Build otomatis tersedia lewat GitHub Actions:

1. Push repository ini ke GitHub.
2. Buka tab **Actions**.
3. Pilih workflow **Build Android Listener APK**.
4. Klik **Run workflow**.
5. Tunggu job selesai.
6. Buka hasil job, lalu download artifact **gateway-listener-debug-apk**.
7. Extract artifact, lalu install file APK di Android.

Setelah install APK baru:

1. Buka aplikasi **Gateway Listener**.
2. Pastikan Server URL sesuai dengan `BASE_URL` gateway kamu.
3. Pastikan Allowed Packages berisi:

```text
id.dana,ovo.id,com.gojek.gopay,com.shopee.id,com.shopeepay.id,com.whatsapp
```

4. Klik **Save Settings**.
5. Buka **Open Notification Access**.
6. Matikan lalu aktifkan ulang akses untuk **Gateway Listener**.
7. Saat notifikasi pembayaran masuk, buka app dan klik **Refresh Debug Log**.

Catatan untuk MIUI/Xiaomi:

- Aktifkan **Autostart** untuk **Gateway Listener**.
- Set Battery Saver aplikasi ke **No restrictions**.
- Jangan force close aplikasi dari Settings.
- Jika debug log menampilkan `listener destroyed`, buka app lalu klik **Rebind Listener**.

## Integrasi Partner / Store

Integrasi partner mengikuti panduan yang sama dengan tab **Konfigurasi** di dashboard.

### Wajib Partner Setting

Partner wajib menyimpan credential dan endpoint ini di backend mereka:

| Field | Keterangan |
| --- | --- |
| Base URL | URL gateway, contoh `http://localhost:3000` atau domain produksi |
| Merchant ID | Format `VER-XXXXX`, lihat tab Konfigurasi di dashboard |
| API Key | Format `gw_live_<token>`, generate via dashboard menu Koneksi |
| Webhook Secret | Dipakai untuk verifikasi `X-Gateway-Signature` callback |
| Callback URL | Endpoint HTTPS partner yang menerima update status payment |

### Header Request

Semua request dari partner ke gateway wajib memakai API key aktif dan merchant ID yang cocok:

```http
Authorization: Bearer gw_live_<token>
X-Merchant-ID: VER-XXXXX
Content-Type: application/json
```

### Create Payment

Endpoint utama yang dipanggil aplikasi store ketika customer checkout:

```http
POST /api/payments
Authorization: Bearer gw_live_<token>
X-Merchant-ID: VER-XXXXX
Content-Type: application/json
```

```json
{
  "external_id": "ORDER-1001",
  "amount": 50000,
  "customer_name": "Customer",
  "callback_url": "https://store-kamu.com/api/payment-callback",
  "expires_in": 900
}
```

### Response Payment

Simpan `payment_id` dan tampilkan QR ke customer dari `qr_image_url` atau `qr_string`:

```json
{
  "payment_id": "AL-XXXXXXX",
  "external_id": "ORDER-1001",
  "amount": 50000,
  "status": "pending",
  "qr_string": "000201010212...",
  "qr_image_url": "http://localhost:3000/api/payments/AL-XXXXXXX/qr",
  "expired_at": "2026-05-04T13:15:00.000Z"
}
```

### Check Status Payment

Partner bisa polling status sebagai fallback jika callback belum diterima:

```http
GET /api/payments/AL-XXXXXXX
Authorization: Bearer gw_live_<token>
X-Merchant-ID: VER-XXXXX
```

### Callback ke Store

Gateway mengirim callback saat payment valid. Verifikasi header signature dengan webhook secret:

```text
Header:
X-Gateway-Signature: HMAC_SHA256(raw_body, webhook_secret)

Body:
{
  "payment_id": "AL-XXXXXXX",
  "external_id": "ORDER-1001",
  "amount": 50000,
  "status": "paid",
  "paid_at": "2026-05-04T13:20:00.000Z"
}
```

### Contoh Verifikasi Callback Node.js

Pastikan verifikasi memakai raw body, bukan object JSON yang sudah berubah urutan formatnya:

```js
import crypto from "node:crypto";

const signature = req.headers["x-gateway-signature"];
const expected = crypto
  .createHmac("sha256", "WEBHOOK_SECRET")
  .update(rawBody)
  .digest("hex");

if (signature !== expected) {
  throw new Error("Invalid callback signature");
}
```

### Aturan Integrasi

- `external_id` harus unik per order aktif.
- `amount` wajib integer rupiah tanpa titik/koma.
- `X-Merchant-ID` wajib dikirim dan harus cocok dengan API key.
- `callback_url` harus bisa menerima request POST JSON.
- Status sukses partner hanya boleh dari callback valid atau polling status `paid`.
- Verifikasi `X-Gateway-Signature` memakai raw body dan webhook secret.

### Retry Callback

Jika store tidak merespon `2xx` (timeout, 5xx, atau error jaringan), gateway otomatis
mengulang callback dengan exponential backoff:

```text
30 detik -> 1 menit -> 5 menit -> 15 menit -> 1 jam -> 6 jam
```

Total maksimum 6 attempt. Setelah attempt ke-6 masih gagal, status callback berubah jadi
`exhausted` dan gateway berhenti mencoba otomatis.

Status callback yang mungkin muncul di response API dan dashboard:

```text
pending    = belum pernah di-attempt (payment baru paid)
sent       = berhasil diterima store (response 2xx)
failed     = attempt terakhir gagal, masih akan di-retry otomatis
exhausted  = semua attempt habis, butuh retry manual
skipped    = payment tidak punya callback_url
expired    = payment expired sebelum dibayar
```

Field tambahan di response `GET /api/payments/:id`:

```json
{
  "callback_status": "failed",
  "callback_attempts": 2,
  "callback_next_retry_at": "2026-05-04T05:15:00.000Z",
  "callback_last_attempt_at": "2026-05-04T05:10:00.000Z"
}
```

Retry manual dari dashboard tersedia lewat tombol **Retry** di kolom Callback, atau
lewat endpoint admin:

```http
POST /api/admin/payments/:payment_id/retry-callback
X-Admin-Token: change-this-admin-token
```

## API Android

Health check untuk memastikan URL gateway bisa dijangkau:

```http
GET /api/android/health
```

Android mengirim notifikasi dengan secret:

```http
POST /api/android/notifications
X-Android-Secret: change-this-android-secret
Content-Type: application/json
```

```json
{
  "package_name": "id.dana",
  "title": "DANA",
  "text": "Anda menerima Rp50.000 dari pembayaran QRIS",
  "received_at": "2026-05-04T12:10:00+07:00"
}
```

Endpoint juga menerima alias `POST /api/android/notification` dan nama field Android umum seperti
`packageName`, `bigText`, `postTime`, `content`, atau `message`.

Package pembayaran yang umum dipakai:

```text
id.dana,ovo.id,com.gojek.gopay,com.shopee.id,com.shopeepay.id,com.whatsapp
```

## WhatsApp BRI-NOTIF

Dashboard menu **Koneksi** punya panel **Koneksi WhatsApp**:

1. Klik **Connect WA**.
2. Scan QR dengan WhatsApp di HP yang menerima chat BRI-NOTIF.
3. Buka menu **Logs WA** untuk melihat pesan yang masuk dan hasil pencocokan nominal.

Format pesan yang didukung antara lain:

```text
Transaksi QR Telah Diterima.

Nominal : 37295
Jam : 2026-04-16 17:39:36
Nomor Referensi : 010000CTM594
```

Nominal akan dicocokkan dengan payment `pending` yang jumlahnya sama dan belum expired.

Jika tombol test dari aplikasi Android masuk ke dashboard tetapi notifikasi pembayaran asli tidak masuk,
aktifkan ulang akses notifikasi untuk aplikasi listener, simpan ulang package filter, lalu restart aplikasi
listener. Android hanya mengirim event notifikasi baru setelah akses listener aktif.

Debug server untuk request Android:

```http
GET /api/admin/android-debug?limit=100
X-Admin-Token: change-this-admin-token
```

Log juga ditulis ke:

```text
data/android-debug.log
```
