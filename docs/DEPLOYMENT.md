# Homeserver deployment

> Deployment update, 13 October 2026: live Calendar and `/admin` Panel now run on ora. Music primary is homeserver, standby is ora; oracle applications are retired. [Current deployment and recovery](ORA-DEPLOYMENT.md). Earlier dated deployment descriptions below are historical.

## Production invitation update — 10 October 2026

The multi-group Calendar web application and invitation routes are now deployed to homeserver at https://calendar.toomtoom.online. Existing SQLite data was retained (548 events and two accounts at migration), and the previous app plus a consistent database backup are stored under `/home/doublep/tutel-calendar/backups/groups-20261010-101849`.

Brevo SMTP is configured in the server-only `.env`. The verified sender is **Tutel Calendar <noreply@toomtoom.online>**, using STARTTLS on port 587. SMTP credentials are never included in documentation or Git. The key expires on 10 October 2027 and after 90 days of inactivity according to Brevo. Free account quota currently shows 300 emails per day.

To invite: sign in as group owner/manager, select the group, open **Manage group → Invite members**, choose **Send invitation by email**, enter the destination email address, select role/expiry, and press **Send invitation**. Email invitations send automatically; link/code invitations are created for copying without email. A failed send preserves the invitation link and the UI reports failure. Confirmed CSV imports create preassigned invitations and queue email delivery in SQLite, processed one at a time. SMTP acceptance does not guarantee inbox placement. Failed sends are visible in invitation history and can be explicitly resent.

The deployed service is active and the live page displays the invitation form. No invitation/delivery test email was sent during this deployment; receiving an actual email has not been verified. Discord worker cutover and the private bot control-panel group integration have not been activated by this web update. Existing bot reminder behavior continues.

## Group integration update — 10 October 2026

Calendar web/groups/invitations/mobile sidebar/shared dates are deployed on homeserver. Grouped Discord reminder worker cutover remains pending; the privileged Calendar bridge and Feedback inbox in the private panel are implemented. Read [current Calendar status](https://github.com/DoubleP987/tutel-calendar/blob/main/docs/CURRENT-STATUS.md).

> Calendar source is deployed independently; bot worker cutover remains pending. Current status is documented in the Calendar repository.

## Current status — 10 October 2026

The separate application is installed in `/home/doublep/tutel-calendar/app`.
Its database is `/home/doublep/tutel-calendar/data/calendar.sqlite`.
The application runs as the user service `tutel-calendar.service` and listens
only on `127.0.0.1:3100`. Local health checks pass and 548 occurrences from the
existing public calendar snapshot were imported. Production demo mode is off.

**https://calendar.toomtoom.online/ is live. Google and Discord production login both work. Vercel entry routes redirect successfully. Netlify deployment is blocked by account credits; it still serves the old website.**

The dedicated tunnel `tutel-calendar` and `tutel-calendar-tunnel.service` are active. Real Discord login returns the owner as calendar manager; a university Google account was verified as a member. Google audience is External / In production. Secrets are stored privately on homeserver.

## Public connection

`Browser → Cloudflare HTTPS → Cloudflare Tunnel → 127.0.0.1:3100`

The hostname is `calendar.toomtoom.online`. Tunnel makes an outbound connection
from homeserver, so changing the home IP does not require DDNS or port forwarding.
Only the calendar web application is exposed. The bot control panel stays private.

Use a remote-managed tunnel with exactly one hostname ingress rule followed by
`http_status:404`. Store its connector token in
`/home/doublep/tutel-calendar/secrets/tunnel-token`, readable only by doublep.
The provisioning token must never be added to the application repository.

## Service management

```sh
systemctl --user start tutel-calendar.service
systemctl --user stop tutel-calendar.service
systemctl --user restart tutel-calendar.service
systemctl --user status tutel-calendar.service
journalctl --user -u tutel-calendar.service -f
```

This machine's `.config` directory is owned by root. Service files therefore
use `~/.local/share/systemd/user/`, matching the existing bot service. The
`default.target.wants` link loads the calendar on user-manager startup; lingering
is enabled. `systemctl --user show default.target -p Wants` confirms the link.

## Existing calendar data

`CALENDAR_SOURCE_URL=https://cskru.vercel.app/api/calendar` imports the existing
public snapshot every 60 seconds. Occurrence IDs include the source event ID and
start timestamp so recurring events do not overwrite one another. All-day end
timestamps are exclusive in the source and converted to inclusive calendar dates.
Imported records are updated by stable ID. The importer does not delete records
that disappear from a snapshot: deletion reconciliation needs a separate policy.
An import failure preserves the last successful data.

This is **one-way synchronization**. New activities in the new website stay in its
own database; they do not automatically become reminders in the original Discord
bot. Existing bot reminders and their original admin data continue independently.

## Redirects

Vercel `/`, `/index.html` and `/calendar` return 307 redirects to the new domain. `/api/calendar` and `/api/calendar/sync` remain unchanged so existing data synchronization continues. Netlify `_redirects` contains equivalent 302 rules, but upload returns HTTP 403: "Account credit usage exceeded - new deploys are blocked until credits are added". Retry after account credits become available; no billing changes were made.

## Secrets and backups

Production `.env` is mode 600. OAuth secrets and VAPID private keys are server-only.
Never deploy local demo databases or commit `.env`, database files, subscriptions,
sessions, or tunnel tokens. Back up SQLite using its backup facility or a consistent
snapshot; copying only the main database during WAL writes is not sufficient.

## ภาษาไทย

เว็บเปิดผ่าน HTTPS แล้ว และทดสอบ login Google/Discord สำเร็จ Vercel redirect แล้ว ส่วน Netlify ถูกระงับ deploy เพราะเครดิตบัญชีครบ
เว็บรับข้อมูลเดิมผ่าน API ทุกนาทีแบบทางเดียว กิจกรรมใหม่ของเว็บนี้ยังไม่ส่งกลับ
ไปเป็นการแจ้งเตือน Discord ของบอทเดิม บริการแยกจากบอทและบัญชีผู้จัดการปฏิทิน
ไม่มีสิทธิ์จัดการเซิร์ฟเวอร์ การเปิด Tunnel ไม่ต้องเปิดพอร์ตเราเตอร์หรือทำ DDNS

## Guest event visibility

Non-members, including signed-out guests, can read only imported general holidays/observances from a public group. User-created activities and imported personal activities remain visible to group members only. Enforcement is server-side in /api/events; merely logging in does not bypass membership. Private groups still require membership. Old data has not been deleted.

## Shared-date deployment

Migration adds data_scope and partial indexes and reclassifies general dates in place. The existing 548 rows/IDs were retained. Backup: /home/doublep/tutel-calendar/backups/shared-calendar-20261010. Upload source/public/docs, install locked dependencies if changed, restart tutel-calendar.service. Never overwrite production .env or data/ with local files. Separate repositories deploy independently; Git push does not activate Discord worker migration.
