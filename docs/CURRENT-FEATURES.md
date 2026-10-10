# Current feature guide / คู่มือการเปลี่ยนแปลงล่าสุด

Updated 10 October 2026. This page describes the current source; the readability cleanup is a local source change until deployed separately.

## Groups and viewing links / กลุ่มและลิงก์ดูปฏิทิน

Open the selected group name in the top bar to open **กลุ่มปฏิทิน**. Everyone who may read that calendar can use **คัดลอกลิงก์ปฏิทิน**; management permissions are not required. Owners also see the same link in group management beside viewing visibility. Links have the form `/g/<slug>`.

Public viewing permits the group link without signing in. A private calendar still requires an authorized member session: copying a link does not change its visibility or grant membership. The default site view shows only shared general dates with no selected CS SKRU group. Shared dates are read once and combined with group activities, not cloned into each new group.

กดชื่อกลุ่มด้านบน → กลุ่มปฏิทิน → คัดลอกลิงก์ปฏิทิน สมาชิกและผู้ชมที่อ่านกลุ่มได้ก็คัดลอกได้ ปฏิทินส่วนตัวไม่ได้กลายเป็นสาธารณะเพียงเพราะส่งลิงก์ ลิงก์ดูปฏิทินกับลิงก์เชิญสมาชิกทำหน้าที่ต่างกัน

## Invitations and account names / คำเชิญและชื่อบัญชี

Email and ordinary link invitations require explicit acceptance using any Google or Discord account, and allow one successful use. An invitation is not automatically accepted merely because the email matches. Anyone holding the link can use it before the recipient; avoid forwarding a single-use invitation unintentionally. Code invitations follow their configured use limit.

CSV columns are `email,name,role`; email is required, name is optional and role selects the invitation permission. Existing members are skipped by CSV import. Accepting an invitation while already a member consumes it without changing the saved membership role; role changes belong in member management.

**ตั้งค่าของฉัน** allows a custom display name, maximum 100 characters. Clearing it restores the current provider name. Authorized managers/owners can additionally see the original provider name and verified email; ordinary member listings do not expose email addresses.

## Editing an activity from the calendar / แก้กิจกรรมจากปฏิทิน

Open your own editable group activity in the selected calendar and use **แก้ไข** in its detail dialog. This reuses the activity editor from **กิจกรรมของฉัน**. Imported/shared dates and activities from another selected context are not editable through this shortcut. The server checks authorization again; `can_edit` in the event response is only a UI hint.

## Scheduled notifications / การแจ้งเตือนตามเวลา

Creating, editing, approving, cancelling or deleting an activity no longer sends event-change notifications. Audit history is retained and already delivered inbox items are not retroactively removed.

- Tomorrow summary: 12:00 Bangkok, if enabled.
- Today's summary: the user's saved day time; a new preference defaults to 07:00 Bangkok.
- Timed activities: configured lead time, then at the activity start, if enabled.
- All-day activity: covered by today's summary; when that summary is off, an individual day reminder may be used.
- Categories, quiet hours and prior opt-outs remain respected. No summary is sent for an empty set.

Quiet hours suppress device Push, while the web inbox still records the notification. Browser/OS permission and an active subscription are required for Push. Scheduled web reminders and the legacy Discord scheduler are separate; grouped Discord worker cutover is still pending. See [Reminder policy](REMINDERS.md).

## Feedback and files / Feedback และไฟล์แนบ

Sign in, choose **Feedback**, add a title/message/category and optionally up to 3 JPG/PNG/WebP images, each up to 5 MB. A draft survives closing the dialog until the page reloads. X and Cancel close this dialog independently of other dialogs. The limit is 5 submissions per account per hour.

Images are decoded and resized to at most 1600 pixels per side, converted to static WebP and stored outside the public directory. Group managers do not gain access to the server's Feedback inbox. Only main-panel administrators can view all messages and set New / In progress / Done. There is no reply thread or attachment purge UI yet.

## Developer reading order / ลำดับอ่านโค้ด

`src/server.js` → authentication/group access → feature routes → SQLite statements → browser modules. Read `public/feedback.js` for static templates and multipart upload; `src/feedback/routes.js` for validation/private file storage; `src/integrations/control/routes.js` for the privileged server-panel bridge. Read `src/notifications/scheduler.js` for reminders and `src/notifications/service.js` for deduplication/Push.

See [Source readability](CODE-STYLE.md), [Developer handbook](DEVELOPMENT.md), [API](API.md) and [current deployment](CURRENT-STATUS.md). Format/syntax checks do not replace full browser, OAuth, audio or device tests.
