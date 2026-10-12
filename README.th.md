# Tutel Calendar

[Current feature guide / คู่มือคุณสมบัติปัจจุบัน](docs/CURRENT-FEATURES.md)

[Source readability / แนวทางจัดโค้ด](docs/CODE-STYLE.md)

[Developer handbook](docs/DEVELOPMENT.md) · [คู่มือผู้พัฒนา](docs/DEVELOPMENT.th.md) · [Contributing / ขั้นตอนส่งงาน](CONTRIBUTING.md)

เวอร์ชัน **0.1.0** · by Double_P

[English](README.md) · [เว็บจริง](https://calendar.toomtoom.online/) · [คู่มือผู้ใช้](docs/USER-GUIDE.th.md)

Repo ปฏิทิน **DoubleP987/tutel-calendar** แยกจากบอทเพลง [tutel-hub](https://github.com/DoubleP987/tutel-hub) ทั้งสองมี process, package.json, .env และข้อมูลแยกกัน

## การใช้งาน

- เดือน สัปดาห์ รายการ แถบกิจกรรมเลือกสี ซ้อนหลายรายการและค้นหา
- มือถือมี sidebar เปิด–ปิดได้ หมวด ธีมและบัญชีอยู่ด้านข้าง ปัดเปลี่ยนช่วงวันได้
- วันสำคัญ/วันหยุดอ่านจากข้อมูลกลางชุดเดียว ไม่ clone ลงกลุ่มใหม่
- กิจกรรมผู้ใช้แยกกลุ่ม ตรวจสิทธิ์ที่เซิร์ฟเวอร์
- Google/Discord login เชื่อมบัญชีโดยพิสูจน์ทั้งสองบัญชี
- สร้างกลุ่ม เชิญด้วยลิงก์ รหัส อีเมล หรือ CSV บทบาทและอนุมัติอัตโนมัติแยกกลุ่ม
- หมวดแสดงผลและแจ้งเตือนบันทึกแยกกลุ่ม กล่องเตือนและ Web Push มีในระบบ

## เริ่มบนเครื่อง

ใช้ Node.js 24+ และ npm

```powershell
git clone https://github.com/DoubleP987/tutel-calendar.git
cd tutel-calendar
npm ci
Copy-Item .env.example .env
npm start
```

เปิด http://127.0.0.1:3100 ครั้งต่อไปใช้ npm start อย่าทับ .env ที่ตั้งแล้ว ตัวอย่างเป็น demo เฉพาะเครื่อง ห้ามเปิดออกอินเทอร์เน็ต วันตัวอย่างไม่ใช่ข้อมูลวันหยุดจริง ต้องตั้ง CALENDAR_SOURCE_URL เพื่อนำเข้าข้อมูลกลาง เว็บจริงปิด demo และใช้ OAuth/HTTPS

SQLite เก็บใน data/calendar.sqlite โปรแกรมสร้างเอง ไม่ต้องติดตั้ง MySQL หรือสร้างบัญชีฐานข้อมูล Client อ่านผ่าน API ไม่เปิดไฟล์นี้ตรง ๆ สำรองด้วย SQLite backup เพื่อให้ครบ WAL และอย่าเปิดไฟล์เดียวร่วมกันจากหลายเซิร์ฟเวอร์

## สถานะและข้อจำกัด

เว็บ ระบบกลุ่ม คำเชิญ sidebar และวันกลางขึ้น homeserver แล้ว ย้ายข้อมูลเดิม 548 รายการ แบ่งเป็นวันกลาง 542 และเฉพาะกลุ่ม 6 จำนวนเป็นสถานะตอนย้าย ไม่ใช่โควตา

บอทแจ้งเตือนจริงยังใช้ TutelBot เดิม API รุ่นใหม่มีแล้ว แต่ worker แจ้งเตือนกลุ่มยังไม่ได้เปิดแทนของเดิม ส่วน bridge ของ Control Panel และ Feedback ใช้งานได้แล้ว Tutel Calendar ใน Discord Developer Portal ใช้เว็บ OAuth ยังไม่ใช่บอทใหม่ที่รันอยู่ การแสดงหลายกลุ่มพร้อมกันและลิงก์ Discord เฉพาะกลุ่มยังเป็นงานค้าง

SMTP ตั้งบนเซิร์ฟเวอร์แล้ว แต่ยังไม่ยืนยันการได้รับเมลจริงและ Push/badge บนอุปกรณ์ Netlify ยังติดเครดิต เว็บไม่สลับไป Oracle เมื่อ homeserver ดับ

## อ่านต่อ

[คู่มือผู้ใช้](docs/USER-GUIDE.th.md) · [กลุ่ม](docs/GROUPS.th.md) · [วันกลาง](docs/SHARED-CALENDAR.md) · [สถานะจริง](docs/CURRENT-STATUS.md) · [โครงสร้าง](docs/ARCHITECTURE.md) · [API](docs/API.md) · [OAuth](docs/OAUTH-SETUP.md) · [แจ้งเตือน](docs/NOTIFICATIONS.md) · [ขึ้นเซิร์ฟเวอร์](docs/DEPLOYMENT.md)

Git ไม่รวม .env ฐานข้อมูล session keys private backups หรือ node_modules ตัวอย่างต้องเว้น secret ว่าง ผู้จัดการปฏิทินไม่มีสิทธิคุมเครื่อง npm run format ใช้ Prettier ช่วยจัดโค้ด ไม่ใช่การทดสอบระบบ

## PDF manuals / คู่มือ PDF

[English guide](docs/manuals/Tutel-Calendar-Guide-EN.pdf) · [คู่มือภาษาไทย](docs/manuals/Tutel-Calendar-Guide-TH.pdf)

## Workflow update — 10 October 2026

See [Current workflow guide](docs/WORKFLOWS.md) and [คู่มือภาษาไทย](docs/WORKFLOWS.th.md). These replace earlier descriptions of immediate ordinary owner transfer, hard activity deletion and single-group-only display. Grouped Discord worker cutover remains pending; Source publication and runtime deployment are separate operations.

## ประวัติและรายชื่อสมาชิก (10 ตุลาคม 2026)

สมาชิกทุก role อ่านรายชื่อ สิทธิ์ และเวลาที่เข้าร่วมกลุ่มเดียวกันได้ พร้อมหน้าประวัติแบ่งหน้า แสดงว่าใครทำอะไรกับรายการไหน เวลาไทย ปุ่มจัดการยังจำกัด role บันทึกใหม่เก็บชื่อสำรองหลังลบรายการ ไม่สร้างประวัติเก่าย้อนหลัง ไม่แสดงอีเมลหรือ token คำเชิญ ดู [คู่มือประวัติกลุ่ม](docs/GROUP-HISTORY.th.md) สำหรับ API โครงสร้างและข้อจำกัด ต้องเริ่มเซิร์ฟเวอร์ใหม่เมื่อ deploy โค้ดรุ่นนี้

## Feedback

ผู้ที่เข้าสู่ระบบส่ง Feedback พร้อมแนบรูปได้สูงสุด 3 รูป กล่องรับอยู่ใน Control Panel หลักและเปิดได้เฉพาะแอดมินของ panel ดู [คู่มือและการเชื่อมต่อ](docs/FEEDBACK.md)

## Invitation links and display names

See [คำเชิญใช้ครั้งเดียวและชื่อที่แสดง / guide](docs/INVITATIONS-AND-PROFILE.md).

## Group administration release / ระบบกลุ่ม 12 October 2026

See [announcements and privileged administration](docs/ANNOUNCEMENTS-AND-ADMIN.md) and [Calendar-owned Discord runtime](docs/DISCORD-CALENDAR-BOT.md) for deletion permissions, external assistance, device Push and URL-based /calendar connect. These current contracts supersede earlier descriptions of legacy Calendar administration.

Backup before the group-management release: [recovery points and rollback procedure](docs/ROLLBACK.md). Private databases and credentials are not published.
