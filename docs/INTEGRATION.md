# Integration / การเชื่อมระบบ

> Deployment update, 13 October 2026: live Calendar and `/admin` Panel now run on ora. Music primary is homeserver, standby is ora; oracle applications are retired. [Current deployment and recovery](ORA-DEPLOYMENT.md). Earlier dated deployment descriptions below are historical.

## Group integration update — 10 October 2026

Calendar web/groups/invitations/mobile sidebar/shared dates are deployed on homeserver. Grouped Discord reminder worker cutover remains pending; the privileged Calendar bridge and Feedback inbox in the private panel are implemented. Read [current Calendar status](https://github.com/DoubleP987/tutel-calendar/blob/main/docs/CURRENT-STATUS.md).

> Calendar source is deployed independently; bot worker cutover remains pending. Current status is documented in the Calendar repository.

## Separate calendar

The new website runs at https://calendar.toomtoom.online/ on homeserver, with its own SQLite database, sessions, members and roles. Calendar managers cannot access the server control panel. Google and Discord are separate identities; accounts are not automatically linked by display name or email.

## Existing calendar data

The server reads https://cskru.vercel.app/api/calendar every 60 seconds. It imported 548 occurrences at deployment. Stable IDs include the source event ID and occurrence timestamp. Legacy Discord links with `date`, `event` and `at` parameters open the corresponding calendar date/details.

This is one-way synchronization. New events belong to the new calendar database and do not automatically generate reminders from the original Discord bot. The importer preserves data on upstream errors and does not remove records missing from subsequent snapshots. A future deletion and two-way integration policy is required.

## Control panel and redirects

The original control panel now links directly to the public calendar in a new tab. Its old calendar remains available as an archived option. Only navigation assets were changed; the bot service was not restarted for this link.

Vercel entry routes redirect to the new website with HTTP 307. Existing API endpoints remain available. Netlify redirect rules are prepared locally, but production deployment is blocked by account credit exhaustion (HTTP 403). Do not redirect all API paths.

Cloudflare Tunnel connects out from homeserver; changing the home IP needs neither DDNS nor inbound port forwarding. Only the new calendar is public. Homeserver downtime currently makes this website unavailable; Oracle bot failover does not host the calendar.

## ภาษาไทย

ข้อมูลปฏิทินเดิมส่งผ่าน API มาเว็บใหม่ทุกนาทีแบบทางเดียว กิจกรรมที่เพิ่มในเว็บใหม่ยังไม่ย้อนกลับไปเป็นแจ้งเตือนของบอทเดิม ผู้จัดการเว็บปฏิทินไม่มีสิทธิ์ควบคุมเซิร์ฟเวอร์ การเปิด Tunnel ไม่ต้องเปิดพอร์ตที่เราเตอร์ และ source อยู่ repo tutel-calendar แยกจาก tutel-hub

## Repository boundary

Calendar source: https://github.com/DoubleP987/tutel-calendar. Music/private panel: https://github.com/DoubleP987/tutel-hub. Imported general dates are shared across groups; imported custom activities stay in the legacy group. Calendar OAuth does not start a second Discord bot. Multi-group display and explicit Discord-link viewing remain pending.
