# Group and event workflows

[Current feature guide / คู่มือคุณสมบัติปัจจุบัน](CURRENT-FEATURES.md)

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

Grouped Discord worker activation is still a coordinated migration, with `CALENDAR_GROUPS_ENABLED=0` preserved until legacy channels have migrated. `/calendar connect` obtains a same-Discord-account, single-use binding grant once grouped integration is enabled. The Calendar Discord OAuth app itself is not a second bot runtime. Main server-panel emergency owner transfer is a privileged override with audit, distinct from ordinary web owner acceptance. The website still runs on homeserver; Oracle bot failover does not host the website.

These calendar additions were reviewed and formatted; no destructive production membership/event/ownership tests or email batches were performed. Music skip/loop regressions were separately tested (19 relevant automated cases). Do not interpret service startup as full OAuth, push or device validation.
