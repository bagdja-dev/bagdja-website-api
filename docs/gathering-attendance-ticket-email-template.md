# Gathering Attendance Ticket Email Template

Register this template in Bagdja Console under **Owned Applications → `CLIENT_APP_ID` → Messaging → Email → Templates**.

- Template name: `GatheringAttendanceTicket`
- Channel: `EMAIL`
- Subject: `Tiket masuk {{gathering-title}}`
- Content:

```html
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#18181b;line-height:1.6">
  <p>Halo {{attendee-name}},</p>
  <p>Acara <strong>{{gathering-title}}</strong> di {{website-name}} sudah dikonfirmasi. Tunjukkan QR di bawah kepada panitia saat check-in.</p>
  <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 0;color:#71717a;width:140px">Nomor rencana</td><td style="padding:4px 0"><strong>{{plan-number}}</strong></td></tr>
    <tr><td style="padding:4px 0;color:#71717a">Jadwal</td><td style="padding:4px 0"><strong>{{event-date}}</strong></td></tr>
    <tr><td style="padding:4px 0;color:#71717a">Lokasi</td><td style="padding:4px 0"><strong>{{event-location}}</strong></td></tr>
    <tr><td style="padding:4px 0;color:#71717a">Pilihan final</td><td style="padding:4px 0">{{final-options}}</td></tr>
  </table>
  <p style="text-align:center;margin:24px 0">
    <img src="{{ticket-qr-image}}" alt="QR tiket {{attendee-name}}" width="240" height="240" style="display:inline-block;border:1px solid #e4e4e7;padding:8px;background:#fff">
  </p>
  <p style="text-align:center;margin:24px 0">
    <a href="{{ticket-link}}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px;font-weight:700">Buka tiket</a>
  </p>
  <p style="font-size:13px;color:#52525b">Jika gambar QR tidak tampil, buka tiket melalui tombol di atas. Tiket ini bersifat pribadi — jangan bagikan ke orang lain karena satu QR hanya bisa dipakai check-in sekali.</p>
  <p>Sampai jumpa di acara,<br>{{website-name}}</p>
</div>
```

Placeholders are case-sensitive and must match the Website API context exactly: `attendee-name`, `website-name`, `plan-number`, `gathering-title`, `event-date`, `event-location`, `final-options`, `ticket-link`, and `ticket-qr-image`.

- `ticket-link` opens the renderer ticket page (`/gathering/ticket/{token}`); the same URL is encoded in the QR so a regular phone camera also opens the ticket.
- `ticket-qr-image` is a PNG rendered by the renderer route `/api/public/gathering-tickets/{token}/qr`.
- The API uses `GATHERING_ATTENDANCE_TICKET_TEMPLATE`, defaulting to `GatheringAttendanceTicket`. Ticket emails are queued automatically when the initiator confirms the gathering; tenant admins can resend pending ones from the event detail page ("Kirim tiket").
