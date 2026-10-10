# การแจ้งเตือนกิจกรรม / Event reminders

อัปเดต 10 ตุลาคม 2569: แจ้งเตือนกิจกรรมเฉพาะตามกำหนดเวลา ไม่ส่งเมื่อเพิ่ม แก้ไข ลบ ยกเลิก หรืออนุมัติ รายการเหล่านี้ยังอยู่ในประวัติกลุ่ม

- วันพรุ่งนี้: สรุปเวลา 12:00 น. เวลาไทย เปิด/ปิดได้ในการตั้งค่าของฉัน
- วันกิจกรรม: สรุปตามเวลาเตือนทั้งวันที่ผู้ใช้เลือก เปิด/ปิดได้
- กิจกรรมมีเวลา: เตือนก่อนเริ่มตาม leadMinutes และเมื่อถึงเวลาเริ่ม ตามตัวเลือกเตือนกิจกรรม
- กิจกรรมทั้งวัน: ถ้าปิดสรุปรายวันแต่ยังเปิดเตือนกิจกรรม จะเตือนวันจริงตาม dayTime; ถ้าเปิดสรุปรายวันจะรวมในสรุปเพื่อไม่เตือนซ้ำ
- เคารพหมวดที่เลือกและช่วงงดรบกวน ค่าเดิมที่ผู้ใช้ปิดสรุปรายวันไว้ยังคงเดิม
- Discord ยังคงใช้การตั้งค่าของแต่ละกลุ่ม/ช่อง: วันพรุ่งนี้ตอนเที่ยง, วันจริงตาม dailyTime, ก่อนเริ่มเมื่อเปิด timed ไม่ส่งจากการแก้ไขกิจกรรม
- การแจ้งเตือนบัญชี เช่น ขอรับโอนเจ้าของ และการกดทดสอบอุปกรณ์ยังทำงาน
- แจ้งเตือนที่ส่งไปแล้วก่อนอัปเดตยังอยู่ในกล่องข้อความ

เปิดกิจกรรมของตนเองจากปฏิทินแล้วกดแก้กิจกรรมได้ เช่นเดียวกับหน้ากิจกรรมของฉัน เซิร์ฟเวอร์ส่ง can_edit จากสิทธิ์จริงโดยไม่เผย owner_id ในรายการปฏิทิน; API แก้ไขยังตรวจบัญชีและสิทธิ์กลุ่มทุกครั้ง วันสำคัญจากแหล่งกลาง/รายการนำเข้าแก้ไม่ได้จากหน้านี้

## English

Event notifications are scheduled reminders only: tomorrow's summary at 12:00 Bangkok time, the current-day summary at the configured dayTime, and timed reminders before/start. Creation, edits, removal/cancellation, publication and review outcomes no longer trigger event notifications. Audit history is retained. Existing user opt-outs and quiet hours are respected. Discord uses its per-binding reminder configuration. Account notifications and explicit device tests remain available.

Members can edit their own events from the calendar detail dialog. The event list supplies a permission-derived can_edit flag; write endpoints still enforce session, CSRF and group permissions. Imported/shared source events remain read-only.
