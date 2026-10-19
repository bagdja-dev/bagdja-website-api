# Gathering Invoice Email Template

Register this template in Bagdja Console under **Owned Applications → `CLIENT_APP_ID` → Messaging → Email → Templates**.

- Template name: `GatheringInvoice`
- Channel: `EMAIL`
- Subject: `Tagihan reservasi {{gathering-title}}`
- Content:

```html
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#18181b;line-height:1.6">
  <p>Halo {{attendee-name}},</p>
  <p>Reservasi Anda untuk <strong>{{gathering-title}}</strong> di {{website-name}} sudah dikonfirmasi.</p>
  <p>Gathering ini diprakarsai oleh <strong>{{initiator-name}}</strong>.</p>
  <p>Nominal tagihan: <strong>{{invoice-amount}}</strong><br>Batas pembayaran: <strong>{{payment-deadline}}</strong></p>
  <p style="margin:24px 0">
    <a href="{{invoice-link}}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px;font-weight:700">Lihat tagihan</a>
  </p>
  <p style="margin:24px 0">
    <a href="{{order-link}}" style="display:inline-block;background:#fff;color:#18181b;text-decoration:none;padding:12px 20px;border:1px solid #d4d4d8;border-radius:4px;font-weight:700">Lihat detail pesanan</a>
  </p>
  <p>Detail tagihan dapat dilihat melalui tautan tersebut. Untuk membayar sendiri, masuk menggunakan akun Bagdja dengan email yang sama seperti email reservasi. Dana pembayaran ditahan melalui escrow dan dikembalikan ke dompet pihak yang membayar jika refund diperlukan.</p>
  <p>Salam,<br>{{initiator-name}}<br>{{website-name}}</p>
</div>
```

Placeholders are case-sensitive and must match the Website API context exactly: `attendee-name`, `website-name`, `initiator-name`, `gathering-title`, `invoice-link`, `order-link`, `invoice-amount`, and `payment-deadline`. `initiator-name` uses the initiator's profile name, then username, and falls back to `Penyelenggara gathering` if neither is available. Before checkout exists, `order-link` falls back to the invoice detail page; after a checkout transaction exists, it opens the transaction order detail.

The API uses `GATHERING_INVOICE_TEMPLATE`, defaulting to `GatheringInvoice`. Invoice links contain the registration ID and show only a public-safe summary; payment still requires login. The initiator may also pay multiple invoices in one escrow checkout from the gathering workflow.
