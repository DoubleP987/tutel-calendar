# Release backup and rollback — 12 October 2026

## Recovery points

Both repositories have the remote branch `backup/pre-group-management-20261012` created **before** this release. Calendar commit: `a67bd94`; music/Panel commit: `1dba33b`. GitHub contains source only. It does not contain private environments, account data, uploaded images or database backups.

Private recovery directories on homeserver:

- `/home/doublep/tutel-calendar/backups/pre-group-management-20261012T043059Z`
- `/home/doublep/tutel-bot/backups/pre-group-management-20261012T043059Z`

Calendar contains `app.tar.gz`, a consistent `calendar.sqlite`, `private-data.tar.gz` and `node_modules-prechange/`. Music contains `app.tar.gz` and a logical MongoDB `bot-database.json`. Archives can contain credentials; directory permissions are 700 and private files 600. Do not upload these to a public repository.

## Restore procedure

1. Preserve a new backup of the current data/environment before any restore. Record what is broken.
2. Stop the affected user service: `tutel-calendar.service` and/or `tutelbot.service`.
3. Prefer **source rollback first** using a clean checkout of the backup branch or the private source archive, retaining live databases, private uploads and environments. Restore dependency versions from the old lock file; Calendar also retains its previous node_modules directory.
4. Review environment differences. The release added shared bot credentials, enabled `CALENDAR_GROUPS_ENABLED=1`, and disabled `LEGACY_CALENDAR_ENABLED=0`. Restore the original private environment only when rolling back that integration, and coordinate the two applications' service keys.
5. If reverting to legacy Discord reminders, restore only the relevant old `reminder_options` values from `bot-database.json`. Two shared MongoDB configurations were disabled. Restoring source alone will not re-enable them. Do not enable old and grouped workers for the same channel at the same time.
6. Start services, inspect health and logs, then check the relevant UI. Keep the failed version available for comparison.

A database restore is a separate, destructive recovery step: it discards changes made after the snapshot. Only use it when code rollback cannot recover the data. Stop Calendar before replacing SQLite, preserve the current database plus WAL/SHM, and restore attachments consistently. MongoDB restoration requires the documented database restore tool and careful collection selection; avoid overwriting unrelated guild settings. Permanent group deletion has no normal UI undo; recover affected data from a private backup if necessary.

## ข้อควรรู้

สำรอง GitHub คือโค้ด ส่วนข้อมูลจริงและ secret อยู่ในไฟล์สำรองส่วนตัวบน homeserver ย้อนโค้ดก่อนเพื่อรักษาข้อมูลใหม่ไว้ ถ้าจะย้อนฐานข้อมูลจะเสียรายการที่เกิดหลังสำรอง ต้องเก็บของปัจจุบันอีกรอบก่อนเสมอ ระบบเตือนเก่าถูกปิดทั้งในโปรเซสและค่า MongoDB ดังนั้นต้องคืนค่าเฉพาะส่วนนี้ด้วยหากจะกลับไปใช้จริง ห้ามเปิด worker เก่าและใหม่ซ้อนกัน

No Oracle host was changed for this release. Shared MongoDB settings are shared state and therefore also affect any old runtime that reads them.
