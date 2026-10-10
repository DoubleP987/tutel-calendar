# การแจ้งเตือนและแอปหน้าจอโฮม

## Group integration update — 10 October 2026

Calendar web/groups/invitations/mobile sidebar/shared dates are deployed on homeserver. Discord worker and private panel cutover remain pending; legacy reminders still run. Read [current Calendar status](https://github.com/DoubleP987/tutel-calendar/blob/main/docs/CURRENT-STATUS.md).

> Calendar source is deployed independently; bot worker cutover remains pending. Current status is documented in the Calendar repository.

## ทำงานแล้วในต้นแบบ

- กล่องแจ้งเตือนในเว็บ เก็บลงฐานข้อมูลแยกแต่ละคน
- จำนวนที่ยังไม่อ่านเป็นสีแดงในเมนู อ่านทั้งหมดแล้วลด badge
- สมาชิกเลือกประเภทแจ้งเตือน หมวด เวลาเตือน และเวลาเตือนกิจกรรมทั้งวัน
- ผู้จัดการเลือกแจ้งเมื่อมี pending และเมื่อเผยแพร่อัตโนมัติ
- Web Push subscription แยกบัญชีและอุปกรณ์ จำกัด 5 subscriptions ต่อบัญชี
- VAPID keys สร้างใน .env ส่วนตัว ไม่เผยแพร่ private key
- Service worker รับ push แสดง system notification และ Badging API เมื่อแพลตฟอร์มรองรับ
- Manifest สำหรับติดตั้งเป็นแอป ไม่มีปุ่ม +แอปถาวร

## ลองบนเครื่อง

1. เลือกบทบาทแล้วเปิด ตั้งค่าของฉัน
2. เปิดแจ้งเตือนบนอุปกรณ์ แล้วอนุญาตผ่าน browser
3. ส่งแจ้งเตือนทดลอง ต้องมี subscription ที่สมัครสำเร็จก่อนจึงเห็นนอกเว็บ
4. ดูกล่องแจ้งเตือน และอ่านทั้งหมดเพื่อเคลียร์ badge

Web Push มีผู้ให้บริการของ browser เป็นตัวกลาง ไม่ใช่ SMS หรืออีเมล การสมัครสำเร็จและการตอบรับจาก push provider ไม่ได้ยืนยันว่าอุปกรณ์แสดงแล้ว เช่นอุปกรณ์ offline, focus mode หรือผู้ใช้ปิดสิทธิ์ ไม่มีการยืนยันเสียงจริงหรือทดสอบบนมือถือในงานนี้

## มือถือ

ต้องมี URL HTTPS ที่มือถือเข้าได้ Localhost บนมือถือคือเครื่องมือถือเอง ไม่ใช่ Windows ต้นแบบ ปัจจุบัน bind 127.0.0.1 จึงทดสอบจากมือถือผ่าน Wi-Fi ไม่ได้จนจัด HTTPS/tunnel หรือ development proxy อย่างเหมาะสม

iPhone/iPad รองรับ Web Push สำหรับแอปที่เพิ่มลง Home Screen บน iOS/iPadOS 16.4+ ให้เปิดจากไอคอนแล้วกดเปิดแจ้งเตือน สิทธิ์ต้องเกิดจากการกดของผู้ใช้ Android ใช้ browser/PWA ที่รองรับได้

สี รูปทรง และการแสดงเลข badge บนไอคอนถูกกำหนดโดย OS/launcher ไม่สามารถรับประกันว่าจะเป็นจุดแดงทุกเครื่อง ถ้าไม่รองรับ Badging API ยังมีจำนวนสีแดงในเว็บและ system notifications ตามความสามารถของ browser

## เวลาและขอบเขต

กิจกรรมทั้งวัน: ก่อนหนึ่งวัน 12:00 และวันจริงตามเวลา default 07:00 ของผู้ใช้ กิจกรรมระบุเวลา: เตือนล่วงหน้าตามที่เลือกและตอนเริ่ม เวลาใช้ Asia/Bangkok ไม่ผูก timezone ของเซิร์ฟเวอร์

Scheduler ตรวจทุก 30 วินาที มี dedupe แต่จะไม่ไล่ส่งย้อนหลังเมื่อหยุดเซิร์ฟเวอร์นานเกินสองนาที การเปลี่ยนเวลาการแจ้งเตือนอาจสร้าง schedule ใหม่ กิจกรรม native แก้ไขได้ตามสิทธิ์ แต่ native recurrence/multi-node Web reminder leases ยังไม่มี

หมวดบน sidebar เป็น display preference และไม่บังคับหมวดแจ้งเตือน: ผู้ใช้เลือก notifyCategories แยกได้ Logout ผ่านเว็บถอน push ของอุปกรณ์นี้ หาก session หมดอายุแต่ยังไม่ได้ logout การสมัคร push ยังคงอยู่จนปิดแจ้งเตือน/ถอน subscription ซึ่งเป็นพฤติกรรมสำหรับรับเตือนแม้ปิดหน้าเว็บ

Endpoints ของ push จำกัดไปยังผู้ให้บริการ browser ที่รู้จักและ HTTPS ไม่ให้ผู้ใช้ชี้ระบบส่งไป arbitrary/private IP ผู้ให้บริการใหม่ที่ไม่อยู่ในรายการจะถูกปฏิเสธจนผ่านการตรวจเพิ่ม

## อ้างอิง

- [Apple Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)
- [WebKit Home Screen Badging](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/)
- [MDN Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API)

## Shared dates and group reminders

Web reminders use publishedEvents for shared dates plus group activities, querying today/tomorrow with each group's member preferences. Inbox and dedupe remain group-scoped. Discord jobs use the same reader, but production worker activation remains pending. Display categories and reminder categories are separate. See CURRENT-STATUS.md.
