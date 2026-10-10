# Shared general calendar / วันทั่วไปชุดกลาง

## Storage

`events.data_scope` is `shared` or `group`. Imported `publicHoliday`/`systemHoliday` occurrences are shared; native submissions and imported custom activities remain group-scoped. Migration retained the original 548 rows and IDs, reclassifying 542 without inserting copies.

Shared rows keep their legacy storage `group_id` for compatibility, but reading them does not depend on that group's visibility. User-created events never become shared just because their category is holiday. Private activities still require group authorization.

## Read flow

```text
Shared published rows (one dataset) ----+
                                       +--> publishedEvents() --> filters --> calendar
Authorized selected-group rows --------+
```

`src/events/published.js` combines disjoint scopes with `UNION ALL`; the original group does not receive duplicate general dates. Partial indexes cover shared dates and group/date queries. Four reusable prepared queries cover group inclusion and optional date overlap.

Web reminders query today/tomorrow, reuse membership preferences and deduplicate overlapping multi-day rows by ID. Discord jobs use the same reader and expose delivery fields only. Categories, channel bindings and delivery dedupe remain separate per group.

## Updating

The importer upserts stable occurrence IDs and scope. A general-date correction updates one row; all groups see it on their next fetch. Missing upstream rows are intentionally retained. Creating groups does not copy the dataset. A fresh local demo has samples, not authoritative dates; configure the source URL for real data.

Simultaneous multi-group display is pending; when implemented it must deduplicate shared IDs. Never share a live SQLite file between hosts or put database files in browser assets/Git.

## ภาษาไทย

วันกลางเก็บครั้งเดียว กิจกรรมผู้ใช้แยกกลุ่มตามเดิม ใช้ query รวมตอนอ่าน ไม่ clone ตาราง และมี index ช่วยค้นหา การแก้วันกลางเปลี่ยนรายการเดียวแล้วทุกกลุ่มอ่านค่าล่าสุด จำนวน 542 เป็นสถานะตอนย้าย ไม่ใช่จำนวนที่บังคับไว้ วันกลางไม่ขึ้นกับสิทธิ์กลุ่ม CS SKRU แต่ข้อมูลส่วนตัวของแต่ละกลุ่มยังต้องตรวจสิทธิ์ก่อนอ่าน
