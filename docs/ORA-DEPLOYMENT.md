# Deployment on ora — 13 October 2026

## Live services

| Host       | Role                                               | Runtime paths                                                        |
| ---------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| homeserver | Primary music bot, automatic lease ownership       | /home/doublep/tutel-bot/app                                          |
| ora        | Music standby and main Control Panel               | /home/ubuntu/tutel-bot/app                                           |
| ora        | Calendar web, SQLite and attachments               | /home/ubuntu/tutel-calendar/app and /home/ubuntu/tutel-calendar/data |
| oracle     | Retired application host, cleared for future reuse | No Tutel runtime                                                     |

The same music source runs on homeserver and ora. Source code equality was checked before and after the move; host configuration is separate. Both use MongoDB Atlas. `CLUSTER_PRIMARY_NODE=homeserver` and `CLUSTER_SECONDARY_NODE=ora` select the two lease participants. `CLUSTER_NODE_ID` identifies the local host. Legacy installations can omit SECONDARY to retain the old `oracle` default. Only a lease owner logs into Discord. The watchdog fences an owner that cannot renew; automatic takeover is normally around 12–15 seconds after heartbeat loss. Returning homeserver regains priority. Neither voice position nor the transient music queue resumes seamlessly after a process/host switch.

Stop the **local** homeserver service (`tutel stop` or `systemctl --user stop tutelbot.service`) to allow ora to take over. The Panel's global bot-off switch disables the bot on both hosts; that does not request failover. Keep automatic mode selected for normal operation. Both hosts need MongoDB and Discord connectivity. Actual forced host-loss takeover was not exercised during this deployment; primary/standby leases and fencing configuration were inspected.

## Media and small-machine limits

On ora, the requested YouTube clip `Rc2k_8skxtI` failed with a sign-in/datacenter challenge. A public SoundCloud track produced five seconds of decoded stereo PCM with the same extractor/FFmpeg binaries. This is a media extraction/decode check, not an independent Discord listener test, and does not prove every YouTube or SoundCloud item is usable.

ora has `MUSIC_SOURCE_OVERRIDE=soundcloud`. Searches use SoundCloud and direct YouTube requests/playlist imports receive a clear SoundCloud-only error. homeserver retains its existing source configuration. `MAX_ACTIVE_VOICE_GUILDS=0` on ora leaves voice-guild concurrency unlimited at the user's request; the homeserver limit was not changed. Available RAM still limits the practical number of simultaneous decoders. ora user services have memory ceilings (music 450 MiB, Calendar 256 MiB, Tunnel 96 MiB) and smaller Node heaps. These are ceilings, not reservations or guarantees. Existing Songkhla/hatyai applications and MySQL on ora were not modified; the VM is still memory constrained under concurrent load.

## Public URLs and authentication

- Calendar: https://calendar.toomtoom.online/
- Main Panel: https://calendar.toomtoom.online/admin

The existing Cloudflare connector token was moved to ora. Calendar still listens on loopback port 3100 and the Panel on loopback port 3001; its namespace is `CONTROL_BASE_PATH=/admin`. Calendar's fixed-loopback proxy `CONTROL_PANEL_PROXY_URL=http://127.0.0.1:3001` streams the `/admin` namespace before Calendar body parsing/authentication. It accepts only that configured loopback service and rejects foreign origins for writes. The existing hostname/tunnel and OAuth callbacks were retained, so links did not change. No new public port forward was added.

Panel login remains the separate MongoDB Panel account. A Calendar Google/Discord member, manager or owner does not inherit server administrator rights. Cookies are Secure on HTTPS, HttpOnly for sessions, SameSite=Strict and scoped to `/admin`; writes require existing CSRF checks. Protected Panel APIs returned 401 without a Panel session, including while the browser had a Calendar Google login. Login failure tracking is bounded. Panel assets, manifests, redirects and API calls use the namespace. Panel service-worker registration is disabled for this prefix so it does not take over the Calendar PWA.

While ora is standby, music status/log/control queries and Discord-dependent Calendar overview/channel validation relay to the active homeserver through encrypted MongoDB jobs. Calendar/user management stays on Calendar's protected service API. If no bot is active, Calendar group/account management still works; Discord channel validation needs an available bot.

The old homeserver Panel can remain available privately. Its Calendar API now uses HTTPS to the ora website. Music autostart on homeserver uses its original user-data systemd default-target link. The old Calendar/Tunnel startup links were removed so reboot cannot revive a stale SQLite copy.

## Verification and recovery

At cutover, the consistent SQLite copy contained 14 accounts, 1 group, 10 memberships, 553 events (including shared general dates), 57 invitations and 2 feedback entries. Counts and invitation-token hashes matched before the subsequent Google login check. Images and private OAuth/SMTP/Push credentials moved with the application data. Google login completed on the same public hostname. No invitation emails or manual announcements were sent for verification. Physical Push and a Discord voice listener were not tested.

Pre-migration source recovery branch: `backup/pre-ora-migration-20261013` in tutel-hub. Private pre-migration application/config backups are under each homeserver project's `backups/pre-ora-migration-20261013T055403Z`. A frozen cutover SQLite/data copy is in `/home/doublep/ora-migration/`. A retirement archive of the original oracle projects/config, including Pumpkin, was already completed at `/home/doublep/migration-backups/oracle-retirement-20261013` before the later request not to create it. No further retirement backup was created after that request. It contains private data and must not be uploaded to GitHub.

To move Calendar back, first stop writes on ora, preserve/copy **current** SQLite and attachments back to homeserver, stop ora's connector, and start exactly one homeserver Calendar/connector. Do not simply start the old home database after users have changed data on ora. Restore the removed startup links deliberately. Music rollback requires matching primary/secondary configuration, source and the selected shared lease target; do not run an old `oracle` worker alongside ora unintentionally.

oracle's old user projects, editor files, Docker/containerd, Nginx, Playit and FFmpeg were cleared at the user's explicit request. The Pumpkin folder was also removed when the instruction changed to clearing the whole application host. SSH keys/base profiles, Tailscale and Oracle cloud agents remain. No new Pumpkin server was installed. This was application/package cleanup, not an OS reinstall or deletion of the cloud VM.

## ภาษาไทย

homeserver ยังเป็นบอทหลัก ora เป็นบอทสำรองและเครื่องรัน Calendar/Panel เข้า Panel ผ่าน /admin ด้วยบัญชี Panel เดิม ไม่ใช้สิทธิ์ผู้จัดการกลุ่มแทนสิทธิ์แอดมินเซิร์ฟเวอร์ ถ้าต้องการให้บอทย้ายเครื่องให้หยุด service เฉพาะ homeserver; ปุ่มปิดบอทใน Panel คือปิดทั้งระบบ

YouTube ที่ทดสอบจาก ora ดึงเสียงไม่ได้ จึงตั้งสำรองเป็น SoundCloud และไม่จำกัดจำนวนเซิร์ฟเวอร์ตามที่ผู้ใช้ขอ จำนวนที่เล่นเสียงพร้อมกันได้จริงยังขึ้นกับ RAM โค้ดเป็นชุดเดียวกับ homeserver แต่ค่าเครื่อง/พอร์ต/แหล่งเพลง/ขีดจำกัดต่างกัน เว็บและข้อมูลใหม่อยู่ ora แล้ว อย่าเปิด Calendar เก่าบนบ้านโดยตรงเพราะข้อมูลจะคนละชุด ระบบไม่เล่นเพลงเดิมต่อจากวินาทีเดิมหลังสลับเครื่อง
