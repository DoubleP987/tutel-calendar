# Notifications and Home Screen / การแจ้งเตือนและแอปหน้าจอโฮม

Updated 10 October 2026. [Current feature guide](CURRENT-FEATURES.md) · [Reminder schedule](REMINDERS.md)

## Event reminders

Web event notifications are scheduled reminders only. Event creation, approval, edit, cancellation and deletion remain in audit history and do not emit `published`, `change` or `review` notifications. The common service rejects those kinds even if a caller still invokes it. Old inbox items remain readable.

Tomorrow's nonempty summary runs at 12:00 Asia/Bangkok when `notifyTomorrow` is enabled. Today's nonempty summary uses `dayTime`, default 07:00 for new preferences. Timed activities may have a lead-time reminder and a start reminder. All-day events use the daily summary, with an individual day reminder only when that summary is disabled. User categories and saved opt-outs remain effective.

Scheduler ticks every 30 seconds. Individual due reminders accept a two-minute due window. Summaries depend on reaching their exact clock minute; the current scheduler is not an offline catch-up queue. Do not promise a reminder while the server is stopped. Deduplication keys include group/user and delivery occasion.

## Quiet hours and unread state

Inbox entries are created before quiet-hour evaluation. Quiet hours suppress device Push; they do not erase the inbox entry. Unread counts are restricted to authorized, active group memberships. Marking read updates the badge count. A supported browser/OS may reflect the unread count through Badging API, but support is not universal.

## Device Push

The authenticated device subscribes using a VAPID public key; the private key remains in the server environment. The service stores at most five subscriptions per account. Notifications require browser permission, a valid subscription, supported browser/OS and configured VAPID credentials. An expired subscription is cleaned up on delivery failure.

On iPhone/iPad use Safari → Share → Add to Home Screen, then open the installed app and enable notifications where supported. Android can use the browser's native installation prompt when available, or its install menu. The sidebar can reopen the installation guide. Introductory installation advice is shown once per browser; already installed mode hides it. See [user guide](USER-GUIDE.md) and the deployed `/install.html` page.

## Accounts, invitations and Feedback

Ownership acceptance notices and explicit test notifications are separate from event-change notifications. Invitation mail uses the SMTP delivery queue and single-use links; it is not the scheduled event-reminder service. Feedback submission is a private multipart API and reaches the main server panel; it does not grant group administrators server access.

## Discord integration boundary

Calendar publishes protected group delivery APIs and jobs. The grouped worker requires a coordinated migration before activation; the production legacy Discord scheduler remains separate. Public website/API deployment does not enable a new Discord bot or move channels automatically. The privileged main-panel Calendar bridge and Feedback inbox are implemented.

## ภาษาไทย

เพิ่มหรือแก้กิจกรรมไม่ส่งแจ้งเตือนแล้ว แต่ยังเก็บประวัติการจัดการ ส่งเฉพาะสรุปวันพรุ่งนี้ สรุปวันนี้ และเตือนก่อนถึง/เมื่อถึงเวลากิจกรรมตามการตั้งค่า ปุ่มดูกิจกรรมในกล่องแจ้งเตือนมีระยะห่างจากวันเวลา และรายการเก่าจะยังอยู่

ช่วงเงียบหยุด Push ออกอุปกรณ์ แต่กล่องในเว็บยังบันทึกไว้ ถ้า homeserver หยุด ระบบนี้ไม่มีการส่งย้อนหลังครบทุกนาทีโดยอัตโนมัติ การแจ้งเตือนบนอุปกรณ์จริงและ badge ต้องทดสอบแยกจากการเช็ก syntax/format และยังไม่ยืนยันครบทุกแพลตฟอร์ม
