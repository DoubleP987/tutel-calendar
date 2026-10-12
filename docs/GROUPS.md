# Multi-group Calendar — implementation guide

## Invitation/account update — 10 October 2026

Email/link invitations now accept any signed-in Google/Discord account, require explicit acceptance and allow one successful use. Automatic email-matched joining has been removed. Users can set a persistent display name; managers additionally see the original provider name and verified email. See [current behavior and API](INVITATIONS-AND-PROFILE.md). This replaces older descriptions of preassignment and email-matching below.

## Production invitation update — 10 October 2026

The multi-group Calendar web application and invitation routes are now deployed to homeserver at https://calendar.toomtoom.online. Existing SQLite data was retained (548 events and two accounts at migration), and the previous app plus a consistent database backup are stored under `/home/doublep/tutel-calendar/backups/groups-20261010-101849`.

Brevo SMTP is configured in the server-only `.env`. The verified sender is **Tutel Calendar <noreply@toomtoom.online>**, using STARTTLS on port 587. SMTP credentials are never included in documentation or Git. The key expires on 10 October 2027 and after 90 days of inactivity according to Brevo. Free account quota currently shows 300 emails per day.

To invite: sign in as group owner/manager, select the group, open **Manage group → Invite members**, choose **Send invitation by email**, enter the destination email address, select role/expiry, and press **Send invitation**. Email invitations send automatically; link/code invitations are created for copying without email. A failed send preserves the invitation link and the UI reports failure. Confirmed CSV imports create preassigned invitations and queue email delivery in SQLite, processed one at a time. SMTP acceptance does not guarantee inbox placement. Failed sends are visible in invitation history and can be explicitly resent.

The deployed service is active and the live page displays the invitation form. No invitation/delivery test email was sent during this deployment; receiving an actual email has not been verified. Discord worker cutover and the private bot control-panel group integration have not been activated by this web update. Existing bot reminder behavior continues.

Local revision: 10 October 2026. Calendar web/group invitation source is deployed; Grouped Discord reminder cutover remains pending; private-panel Calendar management is implemented. Existing production behavior is described separately in DEPLOYMENT.md. This guide supersedes earlier single-calendar assumptions.

## 1. Application boundaries

Calendar owns accounts, groups, membership, events, invitations, preferences, inbox records, Discord channel bindings and delivery jobs. Tutel Bot owns music/radio, Discord connections, host election and the private server control panel. They communicate through authenticated HTTP APIs; they never open the same SQLite file.

```text
Browser -> Calendar session + CSRF -> group permission -> Calendar SQLite
Private panel -> server-side control key -> Calendar management API
Active Discord bot -> delivery key -> claim jobs -> Discord -> acknowledge
```

An account has many memberships; every membership has its own role, suspension, trust and preferences. Each event and Discord binding has a group_id. Knowing another group's ID is not permission to read or modify it. Music remains independent of Calendar availability.

## 2. Groups and roles

Sign in, choose **Create group**, enter a name and unique slug. New groups are private. Switch groups using the selector; the last group and signed-in display/reminder preferences are saved in SQLite. Guest filters are stored separately for each group in browser storage.

| Role                   | Capabilities                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Member                 | Read group events, submit proposals, edit own pending proposals, set personal reminders                             |
| Editor                 | Member capabilities; edit native published events; treated as trusted under trusted approval                        |
| Manager                | Review proposals, manage ordinary members/trust, invitations, group reminder settings and existing Discord bindings |
| Owner                  | Manager capabilities plus appoint managers, change visibility/name and transfer ownership                           |
| Platform administrator | Manage all groups through the private panel; separate from group roles                                              |

Private groups require membership. Public groups permit read-only viewing through `/g/<slug>`. There is no public group directory, search or membership request flow. Blocking a membership does not block other groups. Owners must transfer ownership before their role can be removed or blocked. Self-removal of management access is rejected.

Google/Discord bootstrap administrator IDs and migrated original managers are privileged Calendar accounts. Review that bootstrap list before production migration. Calendar roles do not create private bot-panel accounts or server credentials.

## 3. Invitations and CSV recipients

Owners/managers can create invitations with 1–30 days validity. Email/link invitations have one successful use; join codes allow 1–500 uses; defaults are seven days and one use. Codes contain 12 random hexadecimal characters. Tokens are stored as SHA-256 hashes; plaintext links are shown only when created. Revoke unused invitations from the invitation list. Share private links deliberately.

An email invitation records its destination address but may be accepted by any Google/Discord account holding the link. It requires explicit acceptance, permits one successful use and creates no fabricated account. An existing membership keeps its role; a blocked membership is not bypassed. There is no automatic email-matched joining.

CSV supports UTF-8/BOM, quoted fields and CRLF. Preview before confirmation. Maximum 500 rows and 100 KB; duplicate or invalid email rows prevent the entire import. Roles in CSV are member/editor only. Example:

```csv
email,name,role
student@parichat.skru.ac.th,Student,member
editor@example.com,Editor,editor
```

Creating a copyable invitation link/code needs no mail server. Actual invitation emails require SMTP_HOST, SMTP_PORT, SMTP_FROM and, when required by the provider, SMTP_USER/SMTP_PASSWORD. The sender uses TLS and Nodemailer; the web UI sends email invitations in one action, while link/code invitations are created for copying. Confirmed CSV imports create single-use invitations and queue emails; they do not create accounts or memberships before acceptance. Existing active invitations may be resent while preserving their original role; resending rotates the link. A configured SMTP service, mail delivery and spam reputation are external prerequisites; Brevo SMTP has now been provisioned on homeserver; see the production invitation update above.

## 4. Accounts and OAuth

Google uses basic OpenID/profile/email scopes. University Google accounts are supported; Gmail and university Google Workspace accounts can sign in; any signed-in Google/Discord identity can explicitly accept an unused link invitation. Discord now requests `identify email`; users may need to consent again. Never trust a user-typed email for automatic membership.

From account settings, link the other provider while signed in. A fresh OAuth callback and the current session prove both accounts. If two existing accounts are linked, memberships/events/notifications/subscriptions move transactionally to the current account; higher roles survive, suspensions are retained, and the other account's sessions are revoked. Similar display names or emails alone never merge accounts.

OAuth state is single-use with expiry; return paths are local-only and retain the group/date/event. Session cookies remain HttpOnly/SameSite=Lax and Secure on HTTPS. Browser writes require origin and CSRF checks. Service APIs use separate credentials, not browser cookies.

## 5. Discord group binding

After activating group integration, run `/calendar connect` in the target channel. The requester needs Manage Server; the bot needs View Channel, Send Messages and Embed Links. The bot obtains a single-use ten-minute connection link. Open it, sign in/link the same Discord account, choose a group you manage and confirm. The grant binds that exact guild/channel, so browser input cannot substitute a different channel.

The private system panel can also create a binding after checking the bot's channel permissions. Group managers may configure or disable an existing binding, but cannot arbitrarily change its Discord destination. One group can have several bindings; a channel can receive more than one group's agenda. A private group's reminder is visible to everyone with access to its configured Discord channel: check Discord permissions before binding.

Default summary is 07:00 Asia/Bangkok; tomorrow's summary is noon the preceding day. Timed reminders are optional; category filters, lead time and embed color are per binding. The calendar link includes the exact group/date, and event reminders also include the event ID. Private links still require member login. Daily events are combined into an agenda, not one message per event. Up to five group agendas fit one message; larger batches split to respect Discord button/embed limits, and long agendas link to the full list.

The explicit **send test message** button queues a diagnostic job. It does not prove delivery until the active bot receives it and a message ID is recorded.

## 6. Delivery reliability and host switching

Only the active elected bot polls, every 15 seconds. Calendar creates stable per-binding deduplication keys, atomically claims jobs for 120 seconds, records delivery start, and receives acknowledgement with the Discord message ID. A bot-host change does not change Calendar ownership or copy its database.

| State     | Meaning                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------- |
| pending   | Available to claim                                                                                   |
| claimed   | Worker owns a temporary lease; safe to reclaim after expiry if sending has not started               |
| sending   | Sending began; another host must not blindly send again                                              |
| sent      | Message ID acknowledged                                                                              |
| failed    | Known failure such as unavailable destination; inspect and manually retry                            |
| uncertain | Worker stopped or network/acknowledgement failed after sending began; check the channel before retry |
| expired   | Delivery window has passed                                                                           |

New scheduled jobs have a five-minute catch-up window. Pending/claimed jobs expire after one hour. Exactly-once delivery across two independent services is not guaranteed: a crash between Discord acceptance and local acknowledgement can be uncertain. The panel exposes that state and requires confirmation that the channel was checked before manually retrying. Bot-side message IDs and Discord nonces reduce duplicates. No endless automatic retry flood is used.

If Calendar itself is offline, music can continue and a standby bot can take over music, but neither bot can fetch new Calendar jobs. The website/database do not automatically fail over to Oracle in this implementation. A calendar replica/backup restoration plan is a separate infrastructure task.

## 7. Main private control panel

Open **Manage all groups** using an existing bot-panel administrator account. It displays overview counts, groups, accounts/memberships, group members/roles/trust, ownership transfer, invitations/CSV, native event editing/review, channel bindings/test messages, delivery jobs/retry and audit history. Imported events are read-only while the legacy source remains authoritative.

The browser calls the bot's private proxy. The proxy checks session, admin role, CSRF and a fixed path allowlist, then calls Calendar with CALENDAR_CONTROL_SECRET server-side. Browser JavaScript and Discord messages never receive that credential. CALENDAR_BOT_SECRET has a smaller API surface for bindings, connection grants and delivery claims; it cannot manage users or events. Use distinct long keys and protect the private panel with Tailscale/LAN access.

Lists are bounded: up to 1,000 users/events, 500 invitations/jobs/audit entries. This is a small-deployment interface, not an unlimited analytics export.

## 8. Local setup and migration

Node.js 24+ is required. Install dependencies separately in D:/tutel-calendar and D:/tutel-bot. Existing local `.env` files contain matching, randomly generated service credentials; examples contain blanks. Do not overwrite a configured `.env` with the example.

Calendar `.env` needs both CALENDAR_CONTROL_SECRET and CALENDAR_BOT_SECRET. Bot `.env` needs the same respective values plus:

```dotenv
CALENDAR_SERVICE_URL=http://127.0.0.1:3100
CALENDAR_WEB_URL=http://127.0.0.1:3100
CALENDAR_GROUPS_ENABLED=1
```

HTTP is permitted only for loopback development. For separate hosts use a trusted HTTPS Calendar URL accessible from both bot hosts. Real OAuth mode requires HTTPS and ENABLE_DEMO=0; local demo stays loopback-only. Start Calendar with `npm start`, then open http://127.0.0.1:3100. The main panel uses its existing process/configuration. Running the real bot requires its existing Discord and database setup.

Grouped Discord transport is enabled on homeserver; legacy reminders are disabled. Connect explicitly with `/calendar connect calendar:https://calendar.toomtoom.online/g/<slug>`, using a Discord identity linked to an owner/manager account. Calendar owns the integration and optional standalone runtime; the existing music bot supplies Discord transport temporarily. Main Panel access remains separate from group roles. See the current Calendar DISCORD-CALENDAR-BOT.md and ROLLBACK.md. Website hosting remains on homeserver.

Back up Calendar SQLite with a consistent SQLite backup or while stopped; a live WAL database may have committed rows in its WAL file. Keep the bot's own backup separately. Old event IDs remain, events migrate into the public `cs-skru` group, original members join that group once, and original settings are copied. New groups do not inherit personal activities; they read general dates from one shared dataset. Review original managers before migrating administrator privileges. Stop legacy import/publishing only after Calendar becomes authoritative; do not introduce a two-way sync loop. Imported source removal is not yet reconciled automatically.

The Calendar web service and sender DNS have now been updated as described above. Source publication is separate from the pending grouped Discord worker cutover. No cross-group isolation or email-delivery tests were run.

## 9. Source and API map

| Module                               | Responsibility                                                   |
| ------------------------------------ | ---------------------------------------------------------------- |
| groups/schema.js                     | Additive schema migration, legacy group bootstrap, audit         |
| groups/access.js                     | Resolve group and enforce read/member/manager/owner guards       |
| groups/invitations.js                | Tokens, email matching, CSV parsing, atomic accept               |
| groups/routes.js                     | Group creation/selection, invitations, ownership transfer        |
| auth/oauth.js, auth/link-accounts.js | Login, verified identities, safe account linking                 |
| events/routes.js                     | Group-scoped event validation, proposal/review/edit              |
| members/                             | Membership roles and personal/group settings                     |
| notifications/                       | Group-scoped inbox, Web Push, reminders and optional SMTP        |
| integrations/discord/                | Bindings, restricted service key, leased delivery jobs           |
| integrations/control/                | Platform management API with separate service key                |
| public/groups.js                     | Group selector, invitations, CSV, account linking, Discord setup |
| bot integrations/calendar/           | HTTP client and active-host delivery worker                      |
| bot web/routes/calendar-admin.js     | Private panel proxy and authorization                            |

Browser group routes include `/api/groups`, `/api/group`, `/api/group/select`, `/api/invitations`, `/api/invitations/csv`, `/api/invitations/accept`, `/api/accounts/link/:provider`, `/api/discord-connect` and `/api/discord-bindings`. Group-scoped requests send `x-calendar-group`; this is a selector, not authorization.

Bot service routes are under `/internal/v1/bot`: bindings, connect-grants, claim, jobs/:id/start and jobs/:id/ack. Management routes are under `/internal/v1/control`: overview, groups, users, group members/transfer/invitations/bindings/events, jobs/retry and audit. Exact methods and validation live in the route modules. Never put either service key in a public frontend environment variable.

## Guest event visibility

Non-members, including signed-out guests, can read only imported general holidays/observances from a public group. User-created activities and imported personal activities remain visible to group members only. Enforcement is server-side in /api/events; merely logging in does not bypass membership. Private groups still require membership. Old data has not been deleted.

## Shared general calendar

Every group reads the same holidays and observances. Each occurrence is stored once in events with data_scope=shared. User-created events and imported custom activities keep data_scope=group and remain isolated. Creating a group does not copy any calendar rows.

The API combines shared and authorized group records with UNION ALL. The scopes are disjoint, so a general event appears once, including in the original group. Partial indexes support shared-date and group-date reads. Shared updates apply to all groups on their next fetch; category filters still follow user preferences. Web reminders and the Discord job scheduler use the same combined reader with group-specific settings. Private-group authorization remains required.

## Calendar trash (10 October 2026)

Owner-only deletion, exact-name confirmation and 30-day recovery are implemented. See [Group deletion](GROUP-DELETION.md) for authorization, APIs, cleanup, backups and legacy notification boundaries.

## Workflow update — 10 October 2026

See [Current workflow guide](WORKFLOWS.md) and [คู่มือภาษาไทย](WORKFLOWS.th.md). These replace earlier descriptions of immediate ordinary owner transfer, hard activity deletion and single-group-only display. Grouped Discord worker cutover remains pending; Source publication and runtime deployment are separate operations.

## Group history and directory (10 October 2026)

All authorized group members can read member names, group roles and join timestamps, and a paginated activity history with actor names, item titles and Bangkok timestamps. Management writes remain restricted. New audit snapshots preserve readable names after item deletion; old actions are not reconstructed. No invitation tokens or email addresses are exposed. See [Group history and directory](GROUP-HISTORY.md) for API changes, implementation and retention limitations. Server source changes require a restart as part of deployment.
