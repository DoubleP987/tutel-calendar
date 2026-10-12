# การแยกโปรเจกต์และแนวทางดูแลโค้ด

## อัปเดตระบบกลุ่ม — 10 ตุลาคม 2026

เว็บ Calendar ระบบกลุ่ม คำเชิญ sidebar และวันกลางขึ้น homeserver แล้ว worker Discord และ Panel รุ่นใหม่เปิดบน homeserver แล้ว ระบบเตือนเก่าหยุดแล้ว ให้เชื่อมช่องด้วย /calendar connect พร้อมลิงก์กลุ่ม ดู [สถานะปัจจุบัน](https://github.com/DoubleP987/tutel-calendar/blob/main/docs/CURRENT-STATUS.md)

ปรับปรุง 12 ตุลาคม 2569 - Calendar และ worker ระบบกลุ่มเปิดบน homeserver แล้ว โค้ด worker อยู่ฝั่ง Calendar; token ใหม่แยกได้ในภายหลัง

## 1. แยกสองโปรเจกต์เพื่ออะไร

Tutel Bot อยู่ที่ D:/tutel-bot ดูแลการเชื่อม Discord เพลง วิทยุ คิว การตั้งค่ารายเซิร์ฟเวอร์ และการสลับ homeserver/Oracle หน้า control panel เดิมเป็นเครื่องมือของผู้ดูแลเซิร์ฟเวอร์

Tutel Calendar อยู่ที่ D:/tutel-calendar ดูแลเว็บปฏิทิน บัญชี Google/Discord สมาชิก บทบาทผู้จัดการ การเสนอกิจกรรม การอนุมัติ หมวดหมู่ การแจ้งเตือนเข้าอุปกรณ์ และฐานข้อมูล SQLite ของตนเอง ผู้จัดการปฏิทินไม่มีสิทธิ์เข้าถึง control panel ของเซิร์ฟเวอร์

แต่ละโปรเจกต์มี package.json, package-lock.json, .env, data และ process แยกกัน อย่าให้เว็บสาธารณะเข้าถึงโฟลเดอร์ข้อมูลหรือกุญแจของบอท และอย่าใช้ฐานข้อมูล session เดียวกันเพียงเพราะทั้งคู่ login ด้วย Discord

## 2. สิ่งที่แยกแล้วและสิ่งที่ยังต้องย้าย

โค้ดปฏิทินเดิมของบอทย้ายไป src/integrations/calendar/legacy แล้ว ส่วนเพลงและบัญชีเรียกโมดูล database และ auth ของตนโดยตรง ไม่ผ่าน calendar/db.js ซึ่งถูกนำออกแล้ว

ระบบเดิมยังต้องทำงานต่อเพื่อส่งสรุปรายวันใน Discord และรักษาลิงก์เก่า การย้ายไฟล์ครั้งนี้ไม่ได้ย้ายเจ้าของข้อมูลหรือเปิด API งานแจ้งเตือนใหม่

ข้อมูลเดิมยังเดินทางจากบอทไป Vercel API แล้วเว็บใหม่ดึงทุก 60 วินาที กิจกรรมใหม่ที่อนุมัติบนเว็บยังไม่กลับไปแจ้ง Discord ตัวนำเข้ายังไม่ลบข้อมูลที่หายจากต้นทาง จึงไม่ควรอ้างว่าสองระบบซิงก์ครบทุกทิศทาง

## 3. โครงสร้างบอท

src/index.js ประกอบบริการและปิดระบบตามลำดับ ไม่ควรใส่รายละเอียดเล่นเพลงหรือจัดกิจกรรมทั้งหมดไว้ตรงนี้

src/bot ดูแล Discord lifecycle ข้อความส่วนตัวและ log; src/commands รับคำสั่ง; src/music ดูแลเครื่องเล่น คิว stream สุ่ม วิทยุ และแผงควบคุม; src/cluster ดูแลการเลือกเครื่องทำงานและส่งคำสั่งข้ามเครื่อง

src/auth ดูแลบัญชีและ session ของ control panel; src/database ดูแล store/schema/settings; src/config ดูแลค่าบอท; src/web ดูแลหน้าและ API ของ panel; src/integrations/calendar/legacy เป็นระบบปฏิทินเก่าที่เก็บไว้ระหว่างย้าย

promo-site เป็นเว็บโปรโมท ส่วน vercel-public และ netlify-public เป็นส่วนเผยแพร่เว็บปฏิทินเดิม ไม่ใช่ frontend ของ Tutel Calendar ใหม่

## 4. โครงสร้างปฏิทินใหม่

src/server.js ประกอบ middleware routes ตัวตั้งเวลาและการปิดระบบ

src/auth/oauth.js ดูแล Google/Discord OAuth session และตัวตรวจสิทธิ์; src/members/routes.js ดูแลสมาชิก บทบาท และการตั้งค่าปฏิทิน; src/members/preferences.js ดูแลสิ่งที่แต่ละบัญชีเลือกแสดงและแจ้งเตือน

src/events/routes.js รับและตรวจข้อเสนอกิจกรรม รวมการอนุมัติ; src/events/categories.js เป็นรายการหมวดหมู่; src/database/connection.js เปิด SQLite; migrations.js สร้างและปรับ schema แบบเพิ่มโดยไม่ทิ้งข้อมูล; demo-fixtures.js ใส่ตัวอย่างเฉพาะโหมดทดลอง

src/notifications/service.js ดูแลกล่องแจ้งเตือน HTTP routes และ Web Push; scheduler.js คำนวณเวลาที่ต้องแจ้ง; src/integrations/legacy-calendar/importer.js ดึงข้อมูลเก่าผ่าน API; src/http/security.js จำกัดคำขอและตรวจ origin

public เป็นโค้ดที่ browser ใช้ ห้ามใส่ Client Secret หรือ bot token ไว้ที่นี่ ส่วน scripts เป็นงานดูแลที่เรียกโดยตั้งใจ และ integration เป็นตัวอย่าง service/tunnel สำหรับ deploy

## 5. แนวทางย้ายการแจ้งเตือนในขั้นถัดไป

ให้ Calendar เป็นเจ้าของกิจกรรมและเวลาการแจ้งเตือนเพียงระบบเดียว บอทควรดึงงานผ่าน API ที่ยืนยันตัวตน จองงาน ส่งข้อความ และยืนยันผล ไม่อ่านตาราง SQLite ของ Calendar ตรง ๆ

ต้องมีรหัสงานคงที่ การจองแบบ atomic เวลาหมดอายุ การลองใหม่ และ message ID ที่ส่งแล้ว เพื่อป้องกัน homeserver กับ Oracle ส่งซ้ำ บอทที่อยู่ Oracle ไม่ต้องเปิดพอร์ตรับการเชื่อมต่อ เพราะเป็นฝ่ายเรียก API ออกเอง

ก่อนสลับต้องสำรองข้อมูล เก็บรหัสเดิมสำหรับ deep link เทียบหมวด วันเวลา การเกิดซ้ำ และรายการช่องรับแจ้งเตือน จากนั้นตรวจสรุปที่สองระบบสร้างให้ตรงกันก่อนปิด scheduler/publisher เดิม เมื่อเว็บใหม่เป็นเจ้าของข้อมูลแล้วต้องหยุด import เก่าเพื่อไม่ให้ข้อมูลวนกลับไปมา

ยังไม่ได้เพิ่ม API งานดังกล่าวในรอบนี้ หาก homeserver ปิด เว็บ Calendar จะใช้งานไม่ได้ ส่วนระบบสลับบอทไป Oracle ไม่ได้ทำให้เว็บปฏิทินกลับมาออนไลน์โดยอัตโนมัติ

## 6. รูปแบบโค้ดและฐานข้อมูล

ใช้ Prettier ทั้งสองโปรเจกต์ ย่อหน้า 2 ช่อง มี semicolon ใช้ single quotes ใน JavaScript และ LF เป้าความกว้าง 100 ตัวอักษร คำสั่ง npm run format จัดไฟล์ ส่วน npm run format:check ตรวจรูปแบบเมื่อต้องการ

การจัดรูปแบบไม่ใช่การทดสอบพฤติกรรม รอบนี้ไม่ได้รันชุดทดสอบ ไม่ได้เปิดบอทจริง และไม่ได้ย้ายฐานข้อมูล production ไฟล์สำรองของโค้ดเดิมเก็บนอกโปรเจกต์

SQLite เหมาะกับ Calendar ที่รันเครื่องเดียว ไม่ต้องมี server ฐานข้อมูลเพิ่ม หากต้องให้สองเครื่องเขียนพร้อมกันในอนาคตต้องออกแบบ store กลาง ไม่ใช้ไฟล์ SQLite สองสำเนาแทนกัน บอทยังคงใช้ MongoDB หรือ SQLite ตามการตั้งค่าของตน

อ่านคู่มือฉบับเดิมเพื่อเข้าใจการทำงานได้ แต่ snippet และแผนผังเก่าต้องตีความตามบทปรับโครงสร้างนี้ ใช้ไฟล์ปัจจุบันเป็นแหล่งอ้างอิงเมื่อต้องแก้โค้ด

## Implemented group adapters / การเชื่อมระบบกลุ่ม

Calendar adds groups/, auth/link-accounts.js, integrations/discord/ and integrations/control/. Bot adds integrations/calendar/client.js and worker.js plus web/routes/calendar-admin.js and web/public/calendar-admin.js. CALENDAR_GROUPS_ENABLED defaults to 0 to preserve old reminders until channels are migrated. The management API uses a separate key and can be configured before switching the Discord scheduler. See GROUPS.md and GROUPS.th.md for migration, security and delivery semantics.

## Repository แยก

ปฏิทินอยู่ DoubleP987/tutel-calendar ส่วนเพลงและ control panel อยู่ DoubleP987/tutel-hub แยก dependencies ข้อมูล secret และ process เว็บ Calendar deploy บน homeserver แล้ว การแยก repo ไม่ได้สร้างบอท Discord ใหม่ ตัวส่งเตือนจริงยังเป็น TutelBot เดิม อ่าน CURRENT-STATUS.md และ SHARED-CALENDAR.md ก่อนย้าย worker
