# Calendar-owned Discord bot and link connection

Updated 12 October 2026.

Calendar owns the connection authorization, bindings, jobs and optional Discord runtime. The music repository temporarily supplies the existing Discord connection as a transport adapter. The Calendar bot needs no voice intents, FFmpeg, music queue, MongoDB or music Control Panel runtime.

## Connect the current shared bot

In the destination text channel:

```text
/calendar connect calendar:https://calendar.toomtoom.online/g/cs-skru
```

The command sender needs Manage Server in Discord and owner/manager membership of that Calendar group. Their Discord identity must already be linked to their Calendar account: sign in with Discord, or link Discord from the existing Google account. Knowing a public viewing URL is insufficient. The bot must be able to view/send/embed in that channel. Connection is immediate after both authorization checks; no temporary browser grant is required. Repeating the same group/server/channel connection updates its existing binding.

`/calendar view` shows buttons for calendars bound to the channel. It does not grant web membership or change private visibility. Configure summary time/categories from group bindings or the privileged Panel. Daily and tomorrow jobs are group-scoped; defaults are daily 07:00 and tomorrow noon, with timed reminders optional.

## Change to another bot later

Put the new Discord bot token in Calendar's private `.env` as `CALENDAR_DISCORD_TOKEN`, invite that bot with application-command and text/embed permissions to the desired servers, then restart Calendar. The web service autostarts `src/discord-bot/runtime.js` when the token is set. Commands are registered on that application. Shared music transport receives no claims while Calendar is configured with its own bot token, preventing both workers from sending the same group jobs.

No token is placed in Git, browser code or documentation. The new bot must actually be in the guilds whose jobs it should deliver. If its token is invalid, Calendar's web UI remains available, but bot startup is logged as failed; shared transport stays paused until the bad token is removed or fixed.

An advanced separate-process option is `npm run start:bot`. Set `CALENDAR_DISCORD_AUTOSTART=0` in Calendar's web environment to avoid starting the same bot token twice. This worker still uses the protected Calendar API; it does not open SQLite directly. Do not run two workers with the same token unintentionally.

## Legacy retirement and rollback

Music `LEGACY_CALENDAR_ENABLED=0` retires the old scheduler, publisher, event write routes, settings/test routes and Panel Calendar screen. `CALENDAR_GROUPS_ENABLED=1` selects the new group API adapter on homeserver. Legacy modules/data are retained for rollback; they are not active schedulers. Old channels are not automatically rebound to a group: use the URL command deliberately.

The pre-change source branch is `backup/pre-group-management-20261012` in both repositories. homeserver private backups are under each project's `backups/pre-group-management-20261012T043059Z`. The Calendar backup has a consistent SQLite snapshot, private attachment data and application/environment archive; the music backup has its application/environment archive. Restore the exact environment as well as source when rolling back worker selection. Stop writers before a database restore; additive tables alone do not require restoring the database for a simple code rollback.

## ภาษาไทย

ตอนนี้ใช้บอทที่รันเพลงเป็นตัวเชื่อม Discord ชั่วคราว แต่โค้ดและข้อมูลปฏิทินอยู่ใน repo Calendar ต่อไปใส่ token ของบอทใหม่ใน CALENDAR_DISCORD_TOKEN ของ Calendar แล้ว restart ได้ บอทใหม่ต้องถูกเชิญเข้าเซิร์ฟเวอร์และมีสิทธิ์ส่งข้อความจริงก่อน ระบบไม่ย้ายบอทไปทุกเซิร์ฟเวอร์ให้อัตโนมัติ

การเชื่อมผ่านลิงก์ตรวจทั้งสิทธิ์ใน Discord และสิทธิ์บัญชีในกลุ่มปฏิทิน ผู้ถือแค่ลิงก์สาธารณะเชื่อมช่องไม่ได้ ระบบเก่าหยุดแจ้งเตือน และช่องที่ยังไม่ connect จะยังไม่มีการเตือนกลุ่มใหม่ จนกว่าจะเชื่อมให้เรียบร้อย

Rollback also needs the disabled shared MongoDB reminder options if reverting to legacy reminders. See [backup and rollback](ROLLBACK.md). The music bot automatically retires its Calendar commands when Calendar is configured with a standalone token. Panel channel validation then uses the standalone bot permissions.
