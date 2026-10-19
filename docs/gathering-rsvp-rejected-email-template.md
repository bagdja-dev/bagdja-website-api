# Gathering RSVP Rejection Email Template

Register this template in Bagdja Console under **Owned Applications → `CLIENT_APP_ID` → Messaging → Email → Templates**.

- Template name: `GatheringRsvpRejected`
- Channel: `EMAIL`
- Subject: `Pembaruan reservasi {{gathering-title}}`
- Content:

```html
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#18181b;line-height:1.6">
  <p>Halo {{attendee-name}},</p>
  <p>Mohon maaf, reservasi Anda untuk <strong>{{gathering-title}}</strong> di {{website-name}} belum dapat kami terima.</p>
  <p>Gathering ini diprakarsai oleh <strong>{{initiator-name}}</strong>.</p>
  <p>Nomor rencana: <strong>{{plan-number}}</strong></p>
  <div style="margin:20px 0;padding:14px 16px;border-left:3px solid #71717a;background:#f4f4f5">
    <p style="margin:0 0 6px;font-weight:700">Pesan dari penyelenggara</p>
    <p style="margin:0;white-space:pre-line">{{rejection-message}}</p>
  </div>
  <p>Reservasi ini telah dibatalkan oleh penyelenggara. Silakan hubungi penyelenggara melalui website jika Anda memerlukan informasi lebih lanjut.</p>
  <p>Salam,<br>{{initiator-name}}<br>{{website-name}}</p>
</div>
```

Placeholders are case-sensitive and must match the context sent by Website API exactly: `attendee-name`, `gathering-title`, `website-name`, `initiator-name`, `plan-number`, and `rejection-message`. `initiator-name` uses the initiator's profile name, then username, and falls back to `Penyelenggara gathering` if neither is available.

The API uses `GATHERING_RSVP_REJECTED_TEMPLATE`, defaulting to `GatheringRsvpRejected`. The initiator's message is sent in the same email to each selected attendee. Registration history is retained with status `REJECTED`; the message and rejection time are stored with that record. Only active unpaid RSVP reservations without a seat order can be rejected through the batch action.
