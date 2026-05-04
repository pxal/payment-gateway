# Private QRIS Gateway

Gateway pembayaran QRIS pribadi untuk store sendiri.

## Alur

1. Store membuat order.
2. Store memanggil `POST /api/payments` dengan API key.
3. Gateway mengubah QRIS statis menjadi QRIS dinamis sesuai nominal.
4. Customer membayar QRIS.
5. Aplikasi Android membaca notifikasi pembayaran dan mengirim ke `POST /api/android/notifications`.
6. Gateway mencocokkan nominal dan menandai payment sebagai `paid`.
7. Gateway mengirim callback ke aplikasi store.

## Menjalankan

```bash
copy .env.example .env
npm run seed
npm run dev
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
