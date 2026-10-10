# Invitation links and display names / คำเชิญและชื่อที่แสดง

## Current behavior — 10 October 2026

Email is the **delivery destination**, not a restriction on the accepting account. The holder of an email/link invitation signs in with any Google or Discord account and explicitly accepts. Email and link invitations allow exactly **one successful acceptance**; codes retain their configured use count. Startup also caps older email/link invitations at one use. Previously redeemed links are therefore exhausted; send a fresh invitation if needed.

OAuth login and listing groups no longer automatically redeem invitations by email matching. CSV sends a separate one-use link to each address. The first account to successfully accept owns that redemption. Merely viewing the URL or signing in does not consume it. Expired, revoked, suspended-group and blocked-membership failures do not consume it. The SQLite transaction serializes acceptance. A successful acceptance by an existing member also consumes the link but preserves the member's existing role; it does not promote/demote them or duplicate the join history.

อีเมลเป็นที่รับคำเชิญ ผู้ถือ link ใช้ Google หรือ Discord บัญชีใดก็ได้ ต้องกดรับคำเชิญหลังเข้าสู่ระบบ ลิงก์ใช้สำเร็จได้ 1 ครั้ง รวมถึงลิงก์เก่า ระบบไม่เข้ากลุ่มให้อัตโนมัติเพียงเพราะอีเมลตรงกัน CSV ส่งลิงก์แยกให้แต่ละคน การเปิดอ่านเมลหรือกดดูเว็บยังไม่ใช้สิทธิ์ สมาชิกเดิมกดรับได้แต่สิทธิ์ไม่เปลี่ยน ผู้ที่ถูกระงับยังเข้าร่วมไม่ได้

## Display names

**ตั้งค่าของฉัน → ชื่อที่แสดง** lets the signed-in user set a name of up to 100 characters. Initially it is the provider's profile name. A custom name survives subsequent OAuth sign-ins. Leaving the field blank restores the latest recorded provider name. This changes presentation across the account's groups, not identity, email, permissions or membership.

`users.name` remains the effective public name; additive `custom_name` and `provider_name` columns distinguish the override and latest provider name. Existing records seed provider_name from the current name during migration. Name snapshots already stored in audit/Feedback records remain historical snapshots.

The own-profile API is `GET /api/account/profile` and `PUT /api/account/profile` with `{name}`. Writes require the user's session and CSRF. It cannot edit another user's name.

Ordinary members see public display names in the directory. Calendar owners/managers and main-panel admins additionally see `originalName` and provider-verified `emails`; these private fields are omitted for ordinary readers. Only verified emails already supplied by Google/Discord are available; Discord may not supply an email. The provider name is the last recorded provider profile name, not an immutable/legal name.

ตั้งชื่อเองได้ใน **ตั้งค่าของฉัน** ถ้าเว้นว่างจะกลับไปใช้ชื่อจากบัญชี Google/Discord ชื่อที่ตั้งใช้ทุกกลุ่มและไม่ถูกเขียนทับตอน login หน้าแอดมินแสดงชื่อที่ใช้ พร้อมชื่อบัญชีเดิมและอีเมลที่ยืนยันแล้ว สมาชิกทั่วไปไม่เห็นอีเมลของคนอื่น การตั้งชื่อไม่เปลี่ยนสิทธิ์หรือประวัติเดิม

## Deployment

Deploy the Calendar auth, group schema/invitation routes, account settings, members/control API and corresponding web assets together. The main panel's member renderer must also be updated. Do not copy .env, live databases or private attachments into Git or release archives. Schema changes are additive; take a consistent SQLite backup before restart. See FEEDBACK.md for attachment storage requirements.
