# Tutel Calendar

[Current feature guide / คู่มือคุณสมบัติปัจจุบัน](docs/CURRENT-FEATURES.md)

[Source readability / แนวทางจัดโค้ด](docs/CODE-STYLE.md)

[Developer handbook](docs/DEVELOPMENT.md) · [คู่มือผู้พัฒนา](docs/DEVELOPMENT.th.md) · [Contributing / ขั้นตอนส่งงาน](CONTRIBUTING.md)

Version **0.1.0** · by Double_P

[ภาษาไทย](README.th.md) · [Live calendar](https://calendar.toomtoom.online/) · [User guide](docs/USER-GUIDE.md) · [Current status](docs/CURRENT-STATUS.md)

Independent calendar application for private groups, shared general dates, proposals and invitations. Repository: **DoubleP987/tutel-calendar**. The music bot is maintained separately in [tutel-hub](https://github.com/DoubleP987/tutel-hub).

## Features

- Month/week/list views, stacked colored event bars, search and mobile swipe navigation.
- Collapsible mobile sidebar, persistent desktop sidebar, category filters and saved light/dark theme.
- Holidays and observances stored once, combined with each group's activities when read. Group creation copies no date rows.
- Google/Discord sign-in, explicit verified account linking and multiple group memberships.
- Owner/manager/editor/member roles and manual/trusted/all approval policies.
- Link/code/email invitations, single-action email sending and CSV single-use invitations.
- Per-group display/reminder preferences, inbox, Web Push and Home Screen manifest.
- Server-side group authorization, CSRF protection and parameterized SQLite queries.

## Current deployment

Calendar web/groups/invitations/sidebar/shared dates are deployed on homeserver through Cloudflare Tunnel. Migration retained 548 events, classified as 542 shared and 6 group-specific at that time. These are snapshot counts, not limits.

Production Discord reminders still use the original TutelBot. Calendar implements delivery APIs; grouped reminder worker cutover remains pending; the privileged private-panel bridge is implemented. The Discord OAuth application is not a second running Calendar bot. Authorized multi-group display and explicit group viewing links are implemented.

SMTP is configured and one authorized Gmail invitation was observed in the inbox; mass CSV delivery and physical-device Push/badging are not fully verified. Netlify redirect deployment remains credit-blocked. Website hosting does not fail over to Oracle.

## Local setup

Requirements: Node.js **24+**, npm.

```powershell
git clone https://github.com/DoubleP987/tutel-calendar.git
cd tutel-calendar
npm ci
Copy-Item .env.example .env
npm start
```

Open http://127.0.0.1:3100. Later starts require only npm start; do not overwrite a configured .env.

The example runs a loopback-only demo. Never expose demo login publicly. A fresh local installation has sample fixtures, not authoritative holidays. Set CALENDAR_SOURCE_URL to import general dates. Production requires ENABLE_DEMO=0, configured OAuth and HTTPS.

SQLite creates data/calendar.sqlite automatically. No separate database server or account is needed. Browser/bot clients access HTTP APIs, not the file. Do not share a live SQLite file between hosts. Use SQLite backup for consistent WAL snapshots.

## Guides

| Guide                                                           | Purpose                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| [User guide](docs/USER-GUIDE.md) / [ไทย](docs/USER-GUIDE.th.md) | Navigation, groups, invitations, approval and reminders |
| [Current status](docs/CURRENT-STATUS.md)                        | Deployed behavior and known limits                      |
| [Architecture](docs/ARCHITECTURE.md)                            | Source structure and application ownership              |
| [Groups](docs/GROUPS.md) / [ไทย](docs/GROUPS.th.md)             | Roles and integration cutover                           |
| [Shared dates](docs/SHARED-CALENDAR.md)                         | Storage scopes, shared reads and indexes                |
| [API](docs/API.md)                                              | Session, group context and mutation contracts           |
| [OAuth](docs/OAUTH-SETUP.md)                                    | Google/Discord apps and callbacks                       |
| [Notifications](docs/NOTIFICATIONS.md)                          | Inbox, Push, device requirements                        |
| [Deployment](docs/DEPLOYMENT.md)                                | Tunnel, services and backups                            |
| [Integration](docs/INTEGRATION.md)                              | Legacy import, redirects and bot bridge                 |

## Source structure

```text
src/server.js                     application composition
src/auth/                         OAuth, sessions and account linking
src/database/                     SQLite migrations and demo fixtures
src/groups/                       access, roles and invitations
src/events/                       validation, routes and shared event reader
src/members/                      preferences and member management
src/notifications/                email, inbox, Web Push and reminders
src/integrations/discord/          bindings and delivery-job API
src/integrations/control/          server-only management API
src/integrations/legacy-calendar/  one-way snapshot importer
public/                           UI, sidebar, styles and service worker
scripts/                          maintenance utilities
integration/                      deployment examples
```

## Secrets and maintenance

Git excludes .env, databases, sessions, private keys, dependencies and backups. Commit examples with blank secrets only; never put keys in public/, documentation or URLs. Calendar roles do not grant server-control access.

npm run format and npm run format:check use Prettier. Formatting is not behavior verification. Legacy import remains one-way and preserves records missing from source snapshots. See CURRENT-STATUS.md before enabling worker integration.

## PDF manuals / คู่มือ PDF

[English guide](docs/manuals/Tutel-Calendar-Guide-EN.pdf) · [คู่มือภาษาไทย](docs/manuals/Tutel-Calendar-Guide-TH.pdf)

## Workflow update — 10 October 2026

See [Current workflow guide](docs/WORKFLOWS.md) and [คู่มือภาษาไทย](docs/WORKFLOWS.th.md). These replace earlier descriptions of immediate ordinary owner transfer, hard activity deletion and single-group-only display. Grouped Discord worker cutover remains pending; Source publication and runtime deployment are separate operations.

## Group history and directory (10 October 2026)

All authorized group members can read member names, group roles and join timestamps, and a paginated activity history with actor names, item titles and Bangkok timestamps. Management writes remain restricted. New audit snapshots preserve readable names after item deletion; old actions are not reconstructed. No invitation tokens or email addresses are exposed. See [Group history and directory](docs/GROUP-HISTORY.md) for API changes, implementation and retention limitations. Server source changes require a restart as part of deployment.

## Feedback

Signed-in users can send Feedback with up to three private images. The main Tutel Hub control panel provides an admin-only inbox. See [Feedback guide and API](docs/FEEDBACK.md).

## Invitation links and display names

See [คำเชิญใช้ครั้งเดียวและชื่อที่แสดง / guide](docs/INVITATIONS-AND-PROFILE.md).

## Group administration release / ระบบกลุ่ม 12 October 2026

See [announcements and privileged administration](docs/ANNOUNCEMENTS-AND-ADMIN.md) and [Calendar-owned Discord runtime](docs/DISCORD-CALENDAR-BOT.md) for deletion permissions, external assistance, device Push and URL-based /calendar connect. These current contracts supersede earlier descriptions of legacy Calendar administration.

Backup before the group-management release: [recovery points and rollback procedure](docs/ROLLBACK.md). Private databases and credentials are not published.

## Live deployment — 13 October 2026

Calendar and the privileged `/admin` Panel run on ora; homeserver remains the primary music bot and ora is its SoundCloud standby. [Current hosts, URLs, limits and recovery](docs/ORA-DEPLOYMENT.md).
