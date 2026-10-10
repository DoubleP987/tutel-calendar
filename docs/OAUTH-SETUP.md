# ตั้ง Google และ Discord OAuth

## Group integration update — 10 October 2026

Calendar web/groups/invitations/mobile sidebar/shared dates are deployed on homeserver. Discord worker and private panel cutover remain pending; legacy reminders still run. Read [current Calendar status](https://github.com/DoubleP987/tutel-calendar/blob/main/docs/CURRENT-STATUS.md).

> Calendar source is deployed independently; bot worker cutover remains pending. Current status is documented in the Calendar repository.

OAuth 2.0 คือวิธีให้เว็บไซต์ยืนยันตัวตนกับ Google/Discord โดยเว็บไซต์ไม่รับรหัสผ่านบัญชีเหล่านั้น ต้องสร้าง OAuth application เพื่อได้ Client ID และ Client Secret ไม่ใช่การขอ API Calendar และไม่ใช่ bot token

## สถานะใช้งานจริง — 10 ตุลาคม 2026

Google และ Discord ตั้งค่าแล้วบน homeserver และทดสอบ login ผ่านโดเมนจริงสำเร็จ Google ใช้ External / In production และทดสอบบัญชี @parichat.skru.ac.th แล้วเป็นสมาชิก Discord เจ้าของระบบเป็นผู้จัดการปฏิทิน การจำกัดแอปของมหาวิทยาลัยอื่นยังขึ้นกับผู้ดูแล Google Workspace นั้น ๆ

Callbacks:

- `https://calendar.toomtoom.online/auth/google/callback`
- `https://calendar.toomtoom.online/auth/discord/callback`

Client Secrets เก็บเฉพาะไฟล์ส่วนตัวและ `.env` บนเซิร์ฟเวอร์ ไม่ใช่ bot token และไม่ต้องใส่ในหน้าเว็บหรือ GitHub

## 1. Google

1. เปิด Google Cloud Console เลือกหรือสร้าง project สำหรับ Tutel Calendar
2. เปิด Google Auth Platform ตั้ง Branding: ชื่อแอป support email และข้อมูลผู้พัฒนา
3. Audience เลือก External เพื่อรองรับทั้ง Gmail และ Google Workspace มหาวิทยาลัย
4. ถ้ายังเป็น Testing เพิ่มอีเมลทดสอบใน Test users
5. Clients → Create client → Web application
6. เพิ่ม Authorized redirect URIs:

```text
http://127.0.0.1:3100/auth/google/callback
https://calendar.toomtoom.online/auth/google/callback
```

7. บันทึก `GOOGLE_CLIENT_ID` และ `GOOGLE_CLIENT_SECRET` ลง `.env` แล้ว restart

Callback ต้องตรงทั้ง scheme, hostname, port และ path กับ BASE_URL เช่น localhost กับ 127.0.0.1 เป็นคนละ URI อย่าใช้ client ประเภท Desktop หรือ Client Secret ของแอปอื่น

ระบบร้องขอเฉพาะ `openid email profile` ไม่อ่าน Google Calendar บัญชี `@parichat.skru.ac.th` ใช้ได้ถ้าเป็น Google account และ Workspace administrator อนุญาต third-party app ระบบไม่จำกัด hosted domain หากสถาบันบล็อกต้องให้ผู้ดูแลอนุญาต

## 2. Discord

1. เปิด Discord Developer Portal → Applications → New Application
2. OAuth2 → เพิ่ม Redirects:

```text
http://127.0.0.1:3100/auth/discord/callback
https://calendar.toomtoom.online/auth/discord/callback
```

3. บันทึก Client ID และ Client Secret ใน `.env`
4. ไม่ต้องสร้าง bot หรือเชิญ bot ใหม่สำหรับ login และไม่ต้องนำ DISCORD_TOKEN มาใส่ ระบบใช้ scope `identify email` สำหรับบัญชีและอีเมลคำเชิญที่ยืนยันแล้ว

## 3. ทดลอง / เปิดจริง

Local: ใช้ BASE_URL ที่มี callback ตรงกัน คง loopback และ ENABLE_DEMO=1 ระหว่างดูต้นแบบ Google/Discord ปุ่มจะพร้อมเมื่อมี credential ทั้งคู่ ไม่ส่ง Client Secret ไปเบราว์เซอร์

Production: สร้าง domain/tunnel ก่อน ตั้ง BASE_URL=https://calendar.toomtoom.online และ ENABLE_DEMO=0 อย่าเปิด demo mode ออกอินเทอร์เน็ต Client Secret ใส่เฉพาะไฟล์ส่วนตัว chmod 600 หรือ secret store ไม่ใส่ repo/ภาพหน้าจอ

ตั้ง Google/Discord subject IDs ของผู้ดูแลคนแรกใน GOOGLE_ADMIN_IDS / DISCORD_ADMIN_IDS ก่อนสมัครครั้งแรก จากนั้นให้ role ผ่านหน้าจัดการสมาชิก ไม่ยกระดับบัญชีจากอีเมลมหาวิทยาลัยโดยอัตโนมัติ หากบัญชีสมัครไปแล้ว ให้ผู้จัดการเดิมเปลี่ยนสิทธิ์; รายชื่อ bootstrap ใน env ใช้กับการสร้างบัญชีใหม่เท่านั้น

## อ้างอิง

- [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)

## OAuth กับบอทคนละเรื่อง

Tutel Calendar ใน Discord Developer Portal ใช้ Client ID/Secret สำหรับเว็บ login ด้วย identify email ไม่ใช่ bot token และยังไม่มีบอทปฏิทินใหม่ที่รันแยก ห้ามใส่ secret ลง public/ หรือ Git การเชื่อมบัญชีใช้ POST /api/accounts/link/:provider และต้องพิสูจน์ทั้งสองบัญชีผ่าน OAuth ไม่รวมผู้ใช้เพราะอีเมลเหมือนกันเอง
