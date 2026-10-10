# Current status / สถานะปัจจุบัน

Updated 10 October 2026. This is the operational reference when older learning examples differ.

## Repository and process boundaries

| Repository                | Application                                                              | Runtime                                 |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| DoubleP987/tutel-hub      | Music/radio and private server panel; legacy Calendar adapter            | Existing homeserver/Oracle bot services |
| DoubleP987/tutel-calendar | Calendar website, OAuth, groups, invitations, general dates and job APIs | homeserver tutel-calendar.service       |

The applications do not share environment files, SQLite files, sessions or OAuth secrets. The Discord application “Tutel Calendar” supplies web OAuth. A separate Discord calendar bot process has not been started; production reminders still use the original TutelBot.

## Deployed

- HTTPS calendar.toomtoom.online through outbound Cloudflare Tunnel; no inbound router port required.
- Google/Discord login, verified identity-based linking, group memberships and invitations.
- Compact group popup and collapsible left sidebar on mobile. It closes after selecting a page; categories, theme and account actions are inside it.
- One-action email invitations using server SMTP. Link/code invitations are for copying. CSV adds pending invitations without bulk delivery.
- General dates stored once: 542 shared occurrences and 6 group-specific at migration, 548 total retained. Counts are a snapshot, not a quota.
- Indexed shared/group queries and reusable prepared statements. Creating groups copies no events.
- Web reminders and Discord job generation use the same reader, with group-specific settings. Production Discord worker activation remains pending.

## Visibility and preferences

Non-members of public groups see shared general dates only. Members see the selected group's activities plus shared dates. Private groups require membership. Shared dates do not depend on the original CS SKRU group's visibility.

Signed-in category filters are saved per group in membership preferences; guests use browser storage. Defaults: education, community, important days and holidays. Islamic is an optional category; no unsupported dates are fabricated.

**Pending:** simultaneous multi-group display and explicit Discord-link activity viewing requested separately. These are not implemented by the shared-date update.

## Known limits

- The legacy Discord scheduler/publisher and one-way snapshot import remain active. New native web activities do not yet reach that scheduler.
- The private panel bridge exists in source, but production cutover is pending.
- SMTP is configured; actual invitation email receipt has not been verified. Device Push/badging also remain unverified end-to-end.
- Netlify redirect deployment is blocked by account credits. Vercel redirects preserve legacy API endpoints.
- Website hosting does not fail over to Oracle. Bot election is separate.
- Records missing from later source snapshots are preserved; deletion reconciliation needs an explicit policy.

## Deployment locations and backups

Application: `/home/doublep/tutel-calendar/app`. SQLite: `/home/doublep/tutel-calendar/data/calendar.sqlite`. Secrets remain in the server `.env` and private tunnel token file, outside Git.

Consistent backups: `/home/doublep/tutel-calendar/backups/groups-20261010-101849` and `/home/doublep/tutel-calendar/backups/shared-calendar-20261010`.

## ภาษาไทย

สอง repo แยกรันและแยกข้อมูล เว็บจริงมี sidebar และวันทั่วไปชุดกลางแล้ว กิจกรรมเฉพาะกลุ่มไม่ปนกัน บัญชี Calendar ไม่มีสิทธิคุมเครื่อง การแยก repo ไม่ได้เริ่มบอท Discord ใหม่ ส่วนแสดงหลายกลุ่มพร้อมกัน ลิงก์ Discord แบบเฉพาะกลุ่ม และการเปิด worker แจ้งเตือนใหม่ยังเป็นงานค้าง การขึ้น Git ไม่ได้เปิดระบบเหล่านี้อัตโนมัติ
