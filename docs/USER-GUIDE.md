# User guide

[Current feature guide / คู่มือคุณสมบัติปัจจุบัน](CURRENT-FEATURES.md)

## Invitation/account update — 10 October 2026

Email/link invitations now accept any signed-in Google/Discord account, require explicit acceptance and allow one successful use. Automatic email-matched joining has been removed. Users can set a persistent display name; managers additionally see the original provider name and verified email. See [current behavior and API](INVITATIONS-AND-PROFILE.md). This replaces older descriptions of preassignment and email-matching below.

[ภาษาไทย](USER-GUIDE.th.md) · [Operational status](CURRENT-STATUS.md)

## Contents

1. Open and sign in
2. Navigation and categories
3. Groups
4. Invitations
5. Activities and approval
6. Reminders
7. Install on your Home Screen

## 1. Open and sign in

Visit https://calendar.toomtoom.online/. Non-members of public groups see general holidays/observances. Sign in with Google or Discord to join/create groups. Private groups require membership; a copied URL is not permission. Calendar roles never grant server control-panel access.

## 2. Navigation and categories

Desktop has a left sidebar. On mobile, open it with ☰; close with ×, an outside tap, or by choosing a page. Category filters, theme and account actions are inside. The compact group control stays in the header. Choose month/week/list, Today, arrows or mobile swipes. Search filters displayed activities.

Every group includes general dates from the shared dataset without copying. Defaults are education, community, important days and holidays. Optional categories include public/substitute/bank holidays, Buddhist/holy days, royal observances, traditions, Thai/international dates and Islamic calendar. A category is a filter, not a guarantee of complete source data.

Member filters are stored per group in the database; guest filters and theme use browser storage. Display currently combines only the selected group's activities with general dates. Multi-group display remains pending.

## 3. Groups

Open the group control to create a group, join by invitation or switch groups. New groups are private. The current group is remembered. Owners/managers manage invitations and member roles. Editors can edit native published activities; members can submit and edit their own pending proposals.

## 4. Invitations

Select group → group menu → Manage group / Invite members. Choose one method:

- **Link:** create, copy and share the link yourself.
- **Email:** enter recipient, role and validity, then Send invitation. No additional checkbox. Configured SMTP is required. Failed sends report failure and retain a usable invitation link.
- **Code:** create and copy a join code.

Email invitations match the provider-verified address at sign-in. They do not fabricate accounts. Confirmed CSV imports queue invitation emails per recipient. Existing memberships and suspensions are respected. Revoke unused invitations in history.

## 5. Activities and approval

Choose a date or Add activity. Enter title, description, dates, all-day or start/end times, category and color. Approval follows the group's manual/trusted/all policy. Check My activities for proposal status. Managers review pending submissions. Policy changes apply to new proposals, not old pending records.

Imported general dates are read-only for members. Fix them at the source; corrections become visible to all groups on their next fetch. Native activities remain in their group.

## 6. Reminders

My settings provides notification categories, lead time and all-day time. Display and reminder categories are separate. All-day reminders occur the previous day at 12:00 and on the date at the configured time, default 07:00, Asia/Bangkok. Manager settings control review notifications.

Device notification permission is separate. The inbox remains available when system Push/badging is unsupported. Delivery depends on server uptime, permission and browser/device support. See NOTIFICATIONS.md and CURRENT-STATUS.md for verified limits.

## 7. Install on your Home Screen

On iPhone, iPad and Android, a short introduction appears once per browser after approximately five seconds, without interrupting another open dialog. Close it or choose Later; future visits do not show it automatically. Reopen it using **Add to Home Screen** at the bottom of the sidebar. Clearing website storage or changing browsers may show it again. Standalone app windows hide the installation invitation.

- **iPhone/iPad:** open the calendar in Safari → Share → Add to Home Screen → enable Open as Web App if available → Add. If missing, scroll the share sheet and use Edit Actions. In-app browsers should open the site in Safari first. Websites cannot launch the native installation prompt on iOS.
- **Android:** when supported and ready, tap Install app and confirm the browser prompt. Otherwise use the browser menu → Install app / Add to Home Screen. Open the site in Chrome as a fallback for in-app browsers.

[Installation guide on the website](https://calendar.toomtoom.online/install.html) includes both languages and a theme switch. Installation does not automatically grant notification permission. Native installation has not been verified on physical iOS/Android devices in this update.

Sources: [Apple guide](https://support.apple.com/en-by/guide/iphone/iphea86e5236/ios), [MDN installation API](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).

## Public default and loading screen (10 October 2026)

The default public view has no selected group and shows “ยังไม่มีปฏิทิน”.
`GET /api/public/events` reads only the shared, published dataset, without group-local activities or group labels. It does not depend on CS SKRU membership/visibility. Signed-in users can still resume their selected calendar; explicit group links retain their group context and existing access checks.

`public/boot.js` displays an animated turtle splash while the initial session, group, catalog and event data load. It ends immediately on `tutel:ready`, with no artificial minimum delay. A slow request exposes retry after 15 seconds; load failure exposes an error and retry. `prefers-reduced-motion` disables animations. Installation onboarding waits until the loading overlay closes. Native operating-system splash screens remain controlled by the browser/OS; this animation runs inside the web app.

## Delete and restore a calendar

Only the calendar owner can delete it: open the group menu → Manage group → Delete calendar, then type its exact name. Managers, editors and server administrators do not gain deletion rights from their other roles.

Deletion moves the group into Calendar trash for 30 days. Members cannot open it, group reminders stop and existing invitations are revoked. Open the group menu → Calendar trash → Restore calendar to recover activities, membership and settings before the deadline. Old invitations remain revoked; create new invitations after restoring. A previously suspended calendar remains suspended after restoration.

After 30 days the cleanup worker permanently removes group-local activities, memberships, invitations, bindings and notification records from the live database. Shared holidays/general dates and user accounts remain. Existing backups and audit history have separate retention and are not erased by this feature. Delivery already in progress or messages already sent cannot be recalled. The legacy bot reminder system is separate: its reminders are not disabled by this website operation until the grouped worker migration is enabled.

See [Group deletion internals](GROUP-DELETION.md) for implementation and retention details.

# Group and event workflows

## Find the controls

The calendar remains the main screen. Open the group selector to search your calendars, select one, create/join, choose calendars to display together, open trash or leave. Group administration contains invitations, all group events, Discord bindings, export and audit history. Account settings contain linked sign-in identities, ownership requests and active sessions. Advanced event actions are inside “Manage and history”; draft/recurrence fields are collapsed inside the event editor.

## Membership and ownership

Members can leave without deleting authored activities. An owner must transfer ownership or trash the calendar before leaving. Removal by a manager also preserves events. Managers cannot remove an owner or another manager; use suspension rather than removal to prevent rejoining. Owner transfer is a seven-day request: the existing owner stays owner until the target, who must remain an active member, accepts. The former owner becomes a manager. Requests can be cancelled or declined. Trashing a calendar cancels its ownership request.

Leaving/removal writes a membership exit marker. Old email invitations will not silently re-add the account at login. Explicit acceptance of a valid invitation remains available, without overriding an existing membership role; blocked memberships cannot accept. CSV preview skips existing verified-email members and preserves their roles. Invalid or duplicate CSV rows require correction before submission. Delivery acceptance does not prove inbox receipt.

## Display several calendars

Default is the selected calendar only. Choose additional calendars in the group menu; preferences are stored per account in `account_views`. The selected calendar is always included and remains the destination for new events. Every additional group must be a current, unblocked membership in an unsuspended group. Stale or removed selections are filtered. Shared general dates are deduplicated by event ID and remain stored once. Group names appear in details, agenda rows and event tooltips. Guest root shows only general dates; a public group link may show published group activities without sign-in, while private links require access.

## Events

Drafts are saved without publishing or notifying reviewers. Submit a draft to apply the group's existing manual/trusted/automatic approval policy. Rejection requires a reason. Nonprivileged edits follow the approval policy again. Group-local activities may be cancelled, moved to trash and restored within 30 days. Cancellation removes an event from the published calendar but keeps history. Resubmit a cancelled item to use the approval policy again. Trash restores the previous lifecycle; it does not automatically publish a pending or cancelled item. Imported dates remain managed at their source.

Daily, weekly and monthly recurrence is bounded to one year. The database stores a series once and expands occurrences for reads, instead of copying events. Monthly events on the 31st skip months without a 31st. Edit the whole series from the main edit button; authorized immediate publishers can edit one occurrence in its advanced menu. A review-dependent user must edit the series for approval instead of publishing a one-off override. Cancel one occurrence or the whole series. An exception stores only changed fields; cancelled occurrence entries and overrides are retained with the series. Editing a series does not clear its exceptions automatically.

Activity history records who performed an action and when; it is not a full prior-content diff. Export produces JSON containing group-local event content/status/recurrence, without secrets, member emails or account identifiers. This export is for portability/reference, not a complete recovery backup: occurrence exceptions, memberships and audit are not included. Consistent SQLite backups remain the full recovery mechanism.

## Notifications and sessions

Users choose publication/review/reminder/change alerts by group. Optional daily summaries combine today's matching events once at the configured all-day reminder time. Quiet hours use Asia/Bangkok and suppress device delivery while preserving the web inbox. Equal start/end is rejected. Quiet hours do not postpone device messages or change group Discord schedules. Already dispatched messages cannot be recalled. Pending/claimed Discord jobs containing changed events are expired to avoid delivering outdated snapshots; there is no automatic second daily Discord summary after an edit. The website's change alerts are distinct from the legacy bot scheduler.

Account settings show approximate device types and expiry for active sessions, allow revoking another session, or all others. Old sessions without device metadata are labelled unknown. Unlinking an identity requires another linked identity to remain and revokes other sessions. OAuth linking requires proving both identities; no email-only merge. Session revocation does not unsubscribe independently registered device push subscriptions: turn off device notifications in notification settings if needed.

## Developer map and API

- `groups/lifecycle.js`: membership exits, ownership requests, multi-group account views.
- `events/workflow.js`: additive event lifecycle schema, actions, history, exports and cleanup.
- `events/recurrence.js`: bounded virtual occurrences.
- `auth/account-settings.js`: session metadata, revocation and identity unlinking.
- `public/workspace.js`: secondary dialogs and event action menus.
- `public/groups.js`: group navigation/admin; `public/settings.js`: member and notification settings.

| API                                        | Purpose                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `POST /api/group/leave`                    | Leave current group; owner receives 409                          |
| `DELETE /api/members/:id`                  | Remove a lower-ranked member                                     |
| `POST /api/group/transfer`                 | Create/replace seven-day ownership request                       |
| `GET/DELETE /api/group/transfer`           | Inspect/cancel outgoing request                                  |
| `GET /api/ownership-requests`              | List incoming requests                                           |
| `POST /api/ownership-requests/:id/respond` | `{accept: true/false}`                                           |
| `GET/PUT /api/account/view`                | `{groupIds: [...]}` up to 20 extra groups                        |
| `GET /api/events?groups=id,id`             | Authorized aggregate with one shared dataset                     |
| `GET /api/group/events`                    | Manager's local activity inventory                               |
| `GET /api/events/trash`                    | Own recoverable events, or all for managers/owners               |
| `POST /api/events/:id/action`              | trash, restore, cancel, submit, cancelOccurrence, editOccurrence |
| `GET /api/events/:id/history`              | Authorized action history                                        |
| `GET /api/group/export`                    | Manager JSON export                                              |
| `GET/DELETE /api/accounts[/provider]`      | Linked identities/unlink                                         |
| `GET /api/account/sessions`                | Safe metadata; never bearer tokens/session hashes                |
| `DELETE /api/account/sessions/:id`         | Revoke another own session                                       |
| `POST /api/account/logout-others`          | Revoke all other sessions                                        |

Writes use session authentication and CSRF. Group APIs enforce group context and member/manager/real-owner requirements. Public reads never expose review notes. Existing event status CHECK remains pending/published/rejected; lifecycle adds active/draft/cancelled/trash separately, preserving the database rather than rebuilding it. The ten-minute cleanup removes expired event trash and exceptions. Group purge removes related lifecycle tables, and account merges transfer/clean new account references. Secrets and databases are never part of a source deployment.

## Deployment boundaries

Grouped Discord transport is enabled on homeserver; legacy reminders are disabled. Connect explicitly with `/calendar connect calendar:https://calendar.toomtoom.online/g/<slug>`, using a Discord identity linked to an owner/manager account. Calendar owns the integration and optional standalone runtime; the existing music bot supplies Discord transport temporarily. Main Panel access remains separate from group roles. See the current Calendar DISCORD-CALENDAR-BOT.md and ROLLBACK.md. Website hosting remains on homeserver.

These calendar additions were reviewed and formatted; no destructive production membership/event/ownership tests or email batches were performed. Music skip/loop regressions were separately tested (19 relevant automated cases). Do not interpret service startup as full OAuth, push or device validation.

## Group history and directory (10 October 2026)

All authorized group members can read member names, group roles and join timestamps, and a paginated activity history with actor names, item titles and Bangkok timestamps. Management writes remain restricted. New audit snapshots preserve readable names after item deletion; old actions are not reconstructed. No invitation tokens or email addresses are exposed. See [Group history and directory](GROUP-HISTORY.md) for API changes, implementation and retention limitations. Server source changes require a restart as part of deployment.

## Current source and learning material / โค้ดและสื่อเรียนรู้ปัจจุบัน

The repository conventions are documented in [CODE-STYLE.md](CODE-STYLE.md). The independent Learning Lab is at D:/Tutel-Learning-Lab, contains current snapshots of both repositories, and is not deployed or published with either project. Earlier architecture examples are explicitly identified as historical; current feature explanations take precedence.

## Invitation lifetime — 12 October 2026

New invitations default to no expiration (`days: 0` in the API, `expires_at: 0` in storage). The UI offers no expiry, 1, 7, 14 or 30 days; the API also accepts integer durations 1–30. This applies to link, email, code and newly created CSV invitations. Links and email invitations remain single-use. Codes retain their configured use limit. Revocation, membership restrictions and suspended/trashed-group checks still apply.

A one-time migration upgrades unused, unrevoked existing seven-day invitations to no expiration, including those whose seven days already elapsed. It preserves the invitation ID, token hash, role and email delivery state: previously sent links continue to work and no email is resent. Consumed/revoked invitations are not revived. Explicit finite invitations created after migration keep their chosen duration. Sessions, OAuth states and ownership transfer deadlines are unchanged.

Previously delivered emails may still say seven days: the server-side invitation now has no deadline; email contents cannot be edited retrospectively. Cancel an invitation from the group's invitation list whenever needed. Migration recovery requires the pre-change private SQLite snapshot (restore specific expiry values, not the whole live database).

คำเชิญใหม่ตั้งต้นไม่มีวันหมดอายุ เลือกจำนวนวันได้ในตัวเลือกเพิ่มเติม คำเชิญเดิม 7 วันที่ยังไม่ได้ใช้ครบและไม่ถูกยกเลิก ใช้ลิงก์เดิมได้โดยไม่ส่งเมลใหม่ ทั้งนี้ลิงก์/อีเมลยังใช้ได้ครั้งเดียว ข้อความวันที่ในอีเมลเก่าอาจยังเป็น 7 วัน แต่ระบบตรวจอายุจากฐานข้อมูลที่ปรับแล้ว
