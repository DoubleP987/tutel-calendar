# Feedback / ส่งความคิดเห็น

## User workflow

Sign in with Google or Discord, then choose **Feedback** beside account actions on desktop or in the mobile sidebar. Select Problem, Suggestion or Other, enter a title (120 characters) and description (5,000 characters), and optionally attach up to three JPG, PNG or WebP images, each at most 5 MB. Previews support removal before submission. Closing the dialog preserves the draft in memory until reload; a successful submission clears it.

The form explains that account name, applicable group name, page path and submission time accompany the message. Invite/connect tokens and query strings are not stored in the page path. Group context is captured when the dialog opens; only a group the user belongs to can be associated with the message. Feedback does not require group management permission.

## สำหรับผู้ใช้

เข้าสู่ระบบก่อน แล้วกด **Feedback** ใกล้ส่วนบัญชีบนคอม หรือใน sidebar บนมือถือ เลือกแจ้งปัญหา / เสนอแนะ / อื่น ๆ กรอกหัวข้อและรายละเอียด แนบรูปได้ 3 รูป รูปละ 5 MB มีภาพตัวอย่างและปุ่มลบก่อนส่ง การปิดหน้าต่างยังเก็บร่างไว้ในหน้านี้ เมื่อส่งสำเร็จจึงล้างร่าง

ระบบส่งชื่อบัญชี กลุ่มที่เกี่ยวข้อง หน้าที่เปิดและเวลาส่งร่วมกับข้อความ กล่องรับอยู่ใน Control Panel หลัก แอดมินกลุ่มปฏิทินไม่มีสิทธิ์อ่านกล่องนี้ ไม่ใช่ระบบแชทและยังไม่มีการตอบกลับหรือแจ้งเตือนผลการดำเนินการให้ผู้ส่งอัตโนมัติ

## Administration

The Tutel Hub main panel provides **กล่อง Feedback**, unread counts, 50-item pagination, category/status filters, message detail, private image viewing and explicit read/status updates. Opening a detail marks it read. Statuses are independent of the read flag: `new`, `in_progress`, `done`. A separate control-panel admin session is required. The Calendar browser's platform-admin flag does not grant access to the service inbox.

## API and authorization

- `POST /api/feedback`: authenticated Calendar session + CSRF and origin protection; multipart fields `category`, `title`, `message`, `groupId`, `pagePath`; images use repeated `images` fields.
- `GET /api/feedback/images/:id`: authenticated original submitter only. Attachment URLs are not public links.
- `GET /internal/v1/control/feedback?page=1&status=&category=`: service control secret, paginated `{items,page,hasMore,unread}`.
- `GET /internal/v1/control/feedback/:id`: control secret; message and attachment IDs.
- `PUT /internal/v1/control/feedback/:id`: control secret; optional `{status,read}`; stores update actor and time.
- `GET /internal/v1/control/feedback/images/:id`: control secret; WebP bytes.

The main panel proxies these routes through `/api/calendar-admin/feedback…` after enforcing its own login/admin checks and CSRF for writes. Neither service secret nor Calendar cookies are sent to the panel browser.

## Storage and operations

`src/feedback/routes.js` creates additive SQLite tables `feedback` and `feedback_images`. Messages preserve sender/group names as submission-time snapshots. Images are private files; the default directory is `feedback/` beside `DATABASE_PATH`, outside the public web directory. `FEEDBACK_UPLOAD_DIR` optionally overrides it and must remain outside public/static directories and version control.

Multer holds bounded multipart input in memory; Sharp checks the decoded format, rejects unsupported/animated images, bounds decoded pixels at 25 million, rotates and resizes to at most 1600 × 1600, then re-encodes WebP without original metadata. Processing is sequential within each request. A process-local cap permits two concurrent uploads; users can submit five messages per hour, enforced again inside the SQLite transaction. File writes use opaque UUID names and restrictive permissions. On failure, newly written files are removed and the database transaction rolls back.

Back up **both the SQLite database and image directory**. SQLite-only backups will not include attachments. There is currently no automatic retention purge, operator deletion UI, malware scanning service, or shared image storage across hosts. Configure private backup and disk monitoring accordingly. Existing account/group removal does not automatically erase Feedback snapshots; support removal is an operator responsibility. Group managers cannot access Feedback just because it mentions their group.

Install dependencies (`npm ci`) and restart the Calendar service after deploying this feature; Sharp requires a compatible native package for the target platform. Update the main panel source and restart its service to expose the inbox. This document describes implementation, not proof that a production deployment or end-to-end test has happened.
