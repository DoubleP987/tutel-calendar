# Group announcements, external assistance and platform management

Updated 12 October 2026. Implementation and deployment status are separate; see CURRENT-STATUS.md.

## Group permissions

Owner, manager and editor may trash native activities in their group. A member may trash their own activities, including published ones. The event serializer exposes `can_delete`; server deletion rechecks the real event, selected group and identity. Shared/imported dates cannot be deleted here. Deletion is recoverable for 30 days.

An owner can open Manage group → Special assistance/announcement permissions and grant external assistance by a unique verified email of an existing signed-in account. No account or membership is fabricated. The assistant sees the group in their selector and may read/trash native activities, but cannot edit, create events, manage members, send announcements or receive group notifications. A blocked membership/account cannot bypass its restriction using assistance. Revocation removes access immediately. If the assistant joins as a member, actual membership rights take precedence.

Owner can always send announcements. A manager needs an explicit owner grant and must still be an active manager when sending. Editor/member/external assistant cannot send. Web Calendar roles do not grant access to the private server Panel.

## Announcements without calendar activities

Notifications → Send announcement opens a responsive dialog with selected group, title, body and preview. Title maximum 120 characters, body maximum 2,000. The server records author and audit action, with a client request ID to avoid duplicate acceptance on retries. Limit: five announcements per group per hour.

Recipients are snapshotted from active memberships. A durable outbox processes ten recipients per pass and rechecks account, membership, group suspension/trash and notification preference before delivery. New members do not receive earlier queued announcements. Outsiders never receive them. Leaving or blocking stops new delivery; an OS notification already sent cannot be recalled.

Inbox text remains complete; Push payload text is shortened when needed to stay inside encrypted payload limits. Notification tags include a unique notification ID. Quiet hours suppress device Push but keep the inbox. `notifyAnnouncements` is a per-group user preference, default true for new/default settings. Outbox state `sent` means the inbox delivery was processed, not that a physical screen displayed it. Push/network failure and a crash between inbox insert and delivery acknowledgement can still affect device delivery; this is not an exactly-once Push guarantee.

## Device setup

After joining/selecting a group, a once-per-browser/account/group introductory card points to device settings. Native permission is requested only from an explicit click, with the public key prepared beforehand. Settings show blocked, subscribed or not subscribed state for the current account/device; a subscription from a different account does not count. The test button targets only the current account's current-device endpoint.

iPhone/iPad requires a supported Home Screen web app; use the existing installation guide. Supported desktop/Android browsers require HTTPS and notification permission. OS Focus/Do Not Disturb and browser policy can suppress alerts. This release does not assert physical-device delivery was tested.

## API

| Endpoint                                 | Authorization / meaning                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| GET /api/group/capabilities              | Owner or authorized platform administrator; assistants and manager grants |
| POST /api/group/assistants               | Owner + CSRF, verified existing email                                     |
| DELETE /api/group/assistants/:id         | Owner + CSRF, revoke assistance                                           |
| PUT /api/group/announcement-managers/:id | Owner + CSRF, `{enabled}` for an active manager                           |
| GET /api/group/announcements             | Actual active group member                                                |
| POST /api/group/announcements            | Authorized sender + CSRF, title/body/requestId                            |
| POST /api/push-status                    | Signed-in account, own endpoint state only                                |
| POST /api/push-test                      | Actual group member + CSRF, owned current-device endpoint                 |

## Private Panel management

The Panel Calendar button opens the privileged group/user dashboard rather than impersonating a Google/Discord web account. Statistics include groups, accounts, active memberships and distinct enabled Discord server bindings. Group activity counts exclude the shared dataset.

Admins can search users by name/original name/email/ID, change custom display name, suspend an account, revoke all sessions, add an existing registered account to a group, change role/trust/suspension and remove non-owner members. An owner must be transferred before removal. Provider identity/email values are read-only; changing them would not be a safe account rename. The last active Calendar platform administrator cannot be suspended.

Only the private Panel service can permanently delete a suspended group, with exact-name and `permanent:true` confirmation. It removes group-native activities, membership, invitations, bindings and pending announcement deliveries; shared dates and user accounts remain. Audit/Feedback snapshots and private backups follow their separate retention. No production group was deleted merely to exercise this button.

All service routes inherit the control key middleware. Main-panel proxy routes require Panel admin authentication and CSRF for writes; browser code never receives service keys. This privilege is independent from ordinary Calendar manager roles.

## ภาษาไทย: วิธีใช้งาน

เจ้าของกลุ่มเปิดชื่อกลุ่ม → จัดการกลุ่ม → สิทธิ์ผู้ช่วยและการส่งประกาศ กรอกอีเมลที่ผู้ช่วยยืนยันไว้หลังเข้าสู่ระบบแล้ว ผู้ช่วยอ่านและลบกิจกรรมได้ แต่ไม่เป็นสมาชิกและไม่ได้แจ้งเตือน เจ้าของเลือกผู้จัดการที่จะให้ส่งประกาศได้จากหน้าเดียวกัน

ส่งประกาศจากหน้าแจ้งเตือน → ส่งประกาศ กรอกข้อความ ดูตัวอย่างและกดส่งตอนนี้ เป็นรายการในกล่องแจ้งเตือนและ Push ของสมาชิกที่เปิดรับ ไม่สร้างกิจกรรมใหม่ ไม่แจ้งคนนอก/คนที่ออกจากกลุ่มแล้ว

Panel หลักกดปฏิทินและผู้ใช้เพื่อดูทั้งระบบ กลุ่มที่ระงับมีปุ่มลบถาวร ต้องกรอกชื่อยืนยัน ก่อนลบเจ้าของต้องเข้าใจว่าการลบนี้ไม่มีการกู้คืนผ่านหน้าปกติ ให้ใช้ไฟล์สำรองเมื่อจำเป็น ไม่ได้ลบกลุ่มจริงในการตรวจหน้าจอรอบนี้
