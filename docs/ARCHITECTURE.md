# Project boundaries and source structure / ขอบเขตและโครงสร้าง

## Group integration update — 10 October 2026

Calendar web/groups/invitations/mobile sidebar/shared dates are deployed on homeserver. Grouped Discord reminder worker cutover remains pending; the privileged Calendar bridge and Feedback inbox in the private panel are implemented. Read [current Calendar status](https://github.com/DoubleP987/tutel-calendar/blob/main/docs/CURRENT-STATUS.md).

Updated 10 October 2026. Calendar source is deployed on homeserver; bot worker activation is a separate migration.

## Two independent applications

| Application                          | Owns                                                                                                          | Does not own                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Tutel Bot (`D:/tutel-bot`)           | Discord client, music/radio, guild music settings, host failover, private server control panel                | New Calendar members and OAuth sessions       |
| Tutel Calendar (`D:/tutel-calendar`) | Public calendar, proposals/approval, Google/Discord identities, member roles/preferences, SQLite and Web Push | Server control permissions or the music queue |

Each application has its own package.json, package-lock.json, environment, process and data directory. Do not copy secrets, sessions or database files into the other application's repository. Calendar management roles never grant access to the bot control panel. SQLite is suitable for the current single Calendar host; it is not a shared file for concurrent homeserver/Oracle writes.

## Current integration, not the future design

```text
Original bot calendar + legacy reminder scheduler
    -> Vercel snapshot API
    -> Calendar legacy importer (every 60 seconds)
    -> Calendar SQLite -> public website / member notifications

New Calendar proposals -> approval -> Calendar SQLite
    (not yet connected back to the original Discord reminder scheduler)
```

The bot's original calendar implementation now resides in `src/integrations/calendar/legacy/`. It still runs and keeps original guild configuration, daily summaries, links and publishing compatible. Relocating those files does not migrate data or retire the scheduler. The importer is `src/integrations/legacy-calendar/importer.js` in the new Calendar project. Imported data is read-only in the Calendar member workflow; disappearance from the source snapshot does not yet delete imported rows.

## Intended integration after a separate migration

Calendar should become the single owner of events and reminder schedules. The active bot should pull authenticated delivery jobs, claim a job, send to Discord and acknowledge it. Jobs require stable IDs, atomic claims/expiry, retries and recorded Discord message IDs. Cross-service authentication must be separate from browser sessions and the bot login token. The group integration revision implements these delivery endpoints; activation remains an explicit migration step. See GROUPS.md.

Before switching: back up data, preserve legacy identifiers and deep links, reconcile categories/time zones/recurrence, migrate channel subscriptions, compare generated summaries, then disable the old scheduler and publisher. Stop legacy import once Calendar is authoritative; never create a synchronization loop. Retain rollback data until verification is complete. Music should remain independent of Calendar outages.

## Bot source map

```text
src/
  index.js                         application composition and shutdown
  auth/                            private panel accounts and sessions
  bot/                             Discord lifecycle and private replies
  commands/                        interaction handlers
  music/                           playback, streams, queue, panels, radio
  cluster/                         election, relay and host failover
  config/                          bot settings and profile
  database/                        shared bot store and settings
  integrations/calendar/legacy/    original calendar and Discord reminders
  web/                             private control panel and legacy routes
```

Music, authentication and panel settings import their owners directly from `database/` and `auth/`. The former calendar database facade has been removed. Calendar commands and old calendar panel routes remain integration clients until data migration. The promotion website stays in `promo-site/`; its deployment is independent of the bot process. `vercel-public/` and `netlify-public/` are retained legacy hosting assets, not the new Calendar frontend.

## Calendar source map

```text
src/
  server.js                              composition, middleware, lifecycle
  auth/oauth.js                          provider login, sessions and guards
  members/routes.js                      member roles and calendar settings
  members/preferences.js                 saved display/reminder preferences
  events/routes.js                       proposal validation and review
  events/categories.js                   category catalog and defaults
  database/connection.js                 SQLite connection lifecycle
  database/migrations.js                 idempotent schema initialization/upgrades
  database/demo-fixtures.js               local preview records only
  notifications/service.js               inbox routes and Web Push delivery
  notifications/scheduler.js             background reminder scheduling
  integrations/legacy-calendar/importer.js original snapshot adapter
  http/security.js                       request limits and origin protection
public/                                  browser UI, styles, service worker
scripts/                                 explicit maintenance utilities
integration/                             service/tunnel deployment examples
```

Migrations remain additive and idempotent, using the existing schema. This refactor does not create a new database or change user/event IDs. Demo fixtures stay gated by ENABLE_DEMO and production remains disabled. Route modules still include their application logic where it is small; split services/repositories when behavior grows, rather than creating empty abstraction layers.

## Formatting and maintenance

Both projects use Prettier, two-space indentation, semicolons, single quotes in JavaScript, LF line endings and a 100-column target. Run `npm run format` to write formatting or `npm run format:check` to check it when requested. Formatter ignore files exclude credentials, databases, dependencies and generated snapshots. Formatting does not establish behavioral correctness.

Read dependencies from package.json. Keep database access out of browser code. Keep provider secrets server-only. Log useful failure context without tokens or session values. Add migration and API-contract documentation when behavior changes. Documentation source paths are updated; earlier handbook code excerpts are learning snapshots, not files to copy blindly.

## ภาษาไทย

แยกโปรเจกต์และฐานข้อมูลแล้วในระดับโครงสร้าง แต่ระบบเดิมยังต้องอยู่ระหว่างย้ายข้อมูล จึงรวบรวมไว้ใน integrations/calendar/legacy อย่างชัดเจน การจัดโฟลเดอร์ไม่ได้ทำให้กิจกรรมใหม่ส่ง Discord ได้ทันที ขั้นต่อไปต้องย้ายเจ้าของข้อมูลและทำ API งานแจ้งเตือนพร้อมป้องกันส่งซ้ำ งานรอบนี้ปรับเฉพาะไฟล์ในเครื่อง ไม่มีการ deploy หรือ push GitHub และไม่ได้รันทดสอบระบบ

## Shared dataset and repository ownership

Calendar is published separately as DoubleP987/tutel-calendar; music/private panel remains in DoubleP987/tutel-hub. Dependencies, environments, databases and processes remain independent. src/events/published.js combines shared general dates with authorized group activities using indexed queries. Display, Web reminders and Discord jobs share this reader. Mobile sidebar lives in public/index.html, styles.css and app.js. No dates are cloned when creating a group. See SHARED-CALENDAR.md and CURRENT-STATUS.md.

## Workflow update — 10 October 2026

See [Current workflow guide](WORKFLOWS.md) and [คู่มือภาษาไทย](WORKFLOWS.th.md). These replace earlier descriptions of immediate ordinary owner transfer, hard activity deletion and single-group-only display. Grouped Discord worker cutover remains pending; Source publication and runtime deployment are separate operations.

## Group history and directory (10 October 2026)

All authorized group members can read member names, group roles and join timestamps, and a paginated activity history with actor names, item titles and Bangkok timestamps. Management writes remain restricted. New audit snapshots preserve readable names after item deletion; old actions are not reconstructed. No invitation tokens or email addresses are exposed. See [Group history and directory](GROUP-HISTORY.md) for API changes, implementation and retention limitations. Server source changes require a restart as part of deployment.
