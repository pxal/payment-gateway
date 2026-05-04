# Gateway Android Listener

Aplikasi Android kecil untuk membaca notifikasi pembayaran dan mengirimnya ke private payment gateway.

## Cara Pakai

1. Buka folder `android-listener` di Android Studio.
2. Sync Gradle.
3. Jalankan ke HP Android.
4. Default `Server URL` dan `Android Secret` diambil dari `.env` project gateway.
   Jika `.env` berubah, jalankan dari root project:

   ```bash
   npm run android:sync-env
   ```

5. Di aplikasi Android, kamu tetap bisa override:
   - `Server URL`
   - `Android Secret`
   - `Allowed Packages`

6. Isi `Allowed Packages` dengan package app e-wallet/bank, dipisah koma.
7. Tekan `Save Settings`.
8. Tekan `Open Notification Access`.
9. Aktifkan akses notifikasi untuk `Gateway Listener`.
10. Tekan `Send Test Notification` untuk tes koneksi.

## Build APK Dengan GitHub Actions

Workflow tersedia di:

```text
.github/workflows/build-android-listener.yml
```

Cara build manual:

1. Push project ke GitHub.
2. Buka tab `Actions`.
3. Pilih `Build Android Listener APK`.
4. Klik `Run workflow`.
5. Isi:
   - `base_url`: domain gateway, contoh `https://payment.domainkamu.com`
   - `android_secret`: sama dengan `ANDROID_SHARED_SECRET`
6. Setelah selesai, download artifact:

```text
gateway-listener-debug-apk
```

## Penting

Jangan pakai `localhost` di Android kecuali gateway berjalan di Android itu sendiri.
Untuk development, set `BASE_URL` di `.env` ke IP laptop/server yang satu Wi-Fi dengan HP.

Contoh:

```text
BASE_URL=http://192.168.1.10:1000
```

Endpoint yang dipakai:

```http
POST /api/android/notifications
X-Android-Secret: <ANDROID_SHARED_SECRET>
Content-Type: application/json
```

Payload:

```json
{
  "package_name": "id.dana",
  "title": "DANA",
  "text": "Pembayaran QRIS masuk Rp50.000",
  "big_text": "",
  "received_at": "2026-05-04T20:10:00+07:00"
}
```
