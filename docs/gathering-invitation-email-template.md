# Gathering Invitation Email Template

Register this template in Bagdja Console under the `bagdja-website` application (or the configured `CLIENT_APP_ID`), Messaging, Email templates.

- Template name: `GatheringInvitation`
- Channel: `EMAIL`
- Subject: `{{website-name}} mengundang Anda ke {{gathering-title}}`
- Content:

```html
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#18181b;line-height:1.6">
  <p>Halo {{invitee-name}},</p>
  <p>Anda diundang oleh <strong>{{website-name}}</strong> untuk bergabung dalam rencana gathering <strong>{{gathering-title}}</strong>.</p>
  <p>Silakan buka undangan untuk melihat detail acara dan mengonfirmasi kehadiran:</p>
  <p style="margin:28px 0">
    <a href="{{invite-link}}" style="display:inline-block;padding:12px 20px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:600">Buka undangan</a>
  </p>
  <p>Atau salin tautan ini ke browser Anda:</p>
  <p><a href="{{invite-link}}">{{invite-link}}</a></p>
  <p>Undangan berlaku sampai {{expires-at}}. Jangan teruskan email ini kepada orang lain karena tautan ini khusus untuk penerima undangan.</p>
  <p>Salam,<br>{{website-name}}</p>
</div>
```

Placeholders are case-sensitive and must retain these exact keys because the API sends them as the email context: `invitee-name`, `website-name`, `gathering-title`, `invite-link`, and `expires-at`.

The API uses the template name configured by `GATHERING_INVITATION_TEMPLATE`, defaulting to `GatheringInvitation`. The current email is sent to private invitations with an email address; WhatsApp-only invitations are shared manually from the invitation manager.