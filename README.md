# Private QRIS Gateway

Gateway pembayaran QRIS pribadi untuk store sendiri.

## Alur

1. Store membuat order.
2. Store memanggil `POST /api/payments` dengan API key.
3. Gateway mengubah QRIS statis menjadi QRIS dinamis sesuai nominal.
4. Customer membayar QRIS.
5. Aplikasi Android membaca notifikasi pembayaran dan mengirim ke `POST /api/android/notifications`.
6. Alternatifnya, dashboard bisa connect WhatsApp Web dan membaca chat notifikasi seperti BRI-NOTIF.
7. Gateway mencocokkan nominal dan menandai payment sebagai `paid`.
8. Gateway mengirim callback ke aplikasi store.

## Menjalankan

```bash
copy .env.example .env
npm run seed
npm install
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
2. Pastikan Server URL `https://gateway.verscan.net`.
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

Seed membuat store demo dengan API key:

```text
gw_demo_key_change_me
```

## API Store

### Create Payment

```http
POST /api/payments
Authorization: Bearer gw_demo_key_change_me
Content-Type: application/json
```

```json
{
  "external_id": "ORDER-1001",
  "amount": 50000,
  "customer_name": "Alvian",
  "callback_url": "https://store.example.com/payment-callback",
  "expires_in": 900
}
```

### Check Payment

```http
GET /api/payments/pay_xxx
Authorization: Bearer gw_demo_key_change_me
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

Dashboard menu **Stores** punya panel **Koneksi WhatsApp**:

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

## Callback ke Store

Gateway mengirim `POST` ke `callback_url` dengan header:

```text
X-Gateway-Signature: HMAC_SHA256(payload, webhook_secret)
```

Payload:

```json
{
  "payment_id": "pay_xxx",
  "external_id": "ORDER-1001",
  "amount": 50000,
  "status": "paid",
  "paid_at": "2026-05-04T05:10:00.000Z"
}
```
