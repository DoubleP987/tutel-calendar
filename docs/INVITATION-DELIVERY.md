# Invitation delivery / การส่งคำเชิญ

## 10 October 2026 update

Manual email invitations and confirmed CSV imports both queue SMTP delivery in SQLite.
The worker processes one invitation at a time, checking the queue every two seconds.
No email is sent by CSV preview. Link/code invitation creation does not send email.
UTF-8 CSV supports email,name,role; only email is required, omitted role defaults to member.
CSV role values are member/editor. Existing active invitations retain their original role.

The history page shows queued, sending, SMTP accepted, failed, uncertain, or cancelled.
SMTP accepted means Brevo accepted the message, not that the recipient has seen it.
Inbox placement, spam filtering, bounces, account limits and provider quotas are external.
Failures record only a safe SMTP response code, never raw credentials or full provider errors.
Brevo logs are authoritative for subsequent delivery/bounce events; no webhook is configured.

An explicit resend is available for active email invitations. It rotates the token and
invalidates the previous link, while preserving the role and expiry. Wait at least one
minute after the previous delivery attempt. Pending/in-flight mail cannot be resent.
CSV preview labels existing invitations; confirmation warns before rotating their links.
Existing memberships are never upgraded or downgraded by accepting an invitation.

Queued work survives restarts. A restart during SMTP produces an uncertain outcome and
does not automatically retry, avoiding duplicate delivery. Expired/revoked/used invitations
are cancelled before sending; suspended groups are not sent. URLs are cleared after an attempt.
The invitation_delivery table is created additively; back up SQLite before deploying.

## วิธีใช้งาน

- เชิญแบบกรอกเมล: เลือกส่งทางอีเมลและกดส่ง ระบบเข้าคิวให้ทันที
- CSV: เลือกไฟล์ ตรวจตัวอย่าง แล้วกดยืนยันและส่งอีเมลคำเชิญ
- คำเชิญ CSV เดิมที่ยังไม่ส่ง: นำเข้าไฟล์เดิมและยืนยันส่งซ้ำ หรือกดส่งอีเมลอีกครั้งในประวัติ
- กดรีเฟรชสถานะการส่งเพื่อดูผล หาก SMTP รับแล้วแต่ผู้รับไม่พบ ให้ตรวจจดหมายขยะและ Brevo logs
- ระบบไม่จำกัดโดเมน Gmail หรือเมลมหาวิทยาลัย แต่บัญชีผู้รับต้องยืนยันอีเมลตรงกับคำเชิญ
- การกดส่งซ้ำทำให้ลิงก์เดิมใช้ไม่ได้ ไม่เปลี่ยนสิทธิ์สมาชิกที่มีอยู่แล้ว

No existing invitations are automatically mailed merely by deploying this update.
Historical records have no delivery status until explicitly resent. This release did not
send a new test email or mass-resend previous invitations.


## Workflow update — 10 October 2026

See [Current workflow guide](WORKFLOWS.md) and [คู่มือภาษาไทย](WORKFLOWS.th.md). These replace earlier descriptions of immediate ordinary owner transfer, hard activity deletion and single-group-only display. Grouped Discord worker cutover remains pending; no Git push is part of this update.
