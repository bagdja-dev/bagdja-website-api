# Gathering RSVP Email Verification Template

Register this template in Bagdja Console under **Owned Applications → `CLIENT_APP_ID` → Messaging → Email → Templates**.

- Template name: `GatheringRsvpOtp`
- Channel: `EMAIL`
- Subject: `Kode konfirmasi reservasi {{gathering-title}}`
- Content:

```html
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#18181b;line-height:1.6">
  <p>Halo {{invitee-name}},</p>
  <p>Gunakan kode berikut untuk mengonfirmasi reservasi Anda pada <strong>{{gathering-title}}</strong> di {{website-name}}.</p>
  <p style="margin:28px 0;text-align:center">
    <span style="display:inline-block;padding:14px 22px;border:1px solid #d4d4d8;border-radius:4px;font-size:30px;font-weight:700;letter-spacing:8px;color:#18181b">{{verification-code}}</span>
  </p>
  <p>Kode berlaku selama <strong>{{expires-in-minutes}} menit</strong> dan hanya dapat digunakan satu kali. Jangan bagikan kode ini kepada siapa pun.</p>
  <p>Jika Anda tidak mengajukan reservasi ini, abaikan email ini. Tidak ada attendee yang akan didaftarkan tanpa kode yang benar.</p>
  <p>Salam,<br>{{website-name}}</p>
</div>
```

Placeholders are case-sensitive and must match the context sent by Website API exactly: `invitee-name`, `website-name`, `gathering-title`, `verification-code`, and `expires-in-minutes`.

The API uses `GATHERING_RSVP_OTP_TEMPLATE`, defaulting to `GatheringRsvpOtp`. This is separate from `GatheringInvitation`, which sends the original invitation link. Public/open RSVP asks for email OTP after the attendee submits their reservation; a registration is created only after successful OTP verification. OTP delivery is email-only until a WhatsApp OTP provider is integrated.
