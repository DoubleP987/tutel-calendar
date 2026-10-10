# Calendar trash and deletion

## Lifecycle

Active → owner-confirmed trash → restore within 30 days, or permanent removal from the live database after the deadline. There is no immediate permanent-delete button.

`group_trash` stores the original group ID, slug, display name, actor, deletion timestamp, deadline and previous suspension flag. All lifecycle writes use a synchronous SQLite transaction. Trash marks the group suspended, clears saved selections, revokes invitations, cancels queued invitation emails and expires pending/claimed Discord jobs. The web reminder scheduler and group worker exclude suspended groups. A sending job/email or delivered push cannot be recalled.

`groupContext` returns HTTP 410 for trashed calendars before any platform-administrator bypass. Normal group lists omit trash. Restore checks a real, unblocked owner membership directly. Platform managers cannot impersonate owners for deletion or restoration. Mutating internal control requests for a trashed group return 409; internal read-only oversight remains available with trash metadata.

## API

| Route | Authorization | Behavior |
| --- | --- | --- |
| `DELETE /api/group` | Signed in, CSRF, real owner, selected group | Body `{ "name": "exact current name" }`; returns `ok` and `purgeAfter` |
| `GET /api/groups/trash` | Signed in | Returns only owned, recoverable groups and their deadlines |
| `POST /api/groups/:id/restore` | Signed in, CSRF, real owner | Returns `id` and `slug`; rejects expired trash |

The browser uses its existing group header and CSRF handling. The delete UI requires an exact name before enabling confirmation. Restore preserves events, roles and preferences, reinstates the earlier suspension flag and removes the trash record. It does not revive revoked invitation links or expired delivery jobs, or replay missed notifications.

## Cleanup and preservation

The existing 10-minute server cleanup interval calls `purgeExpiredGroups()`. Cleanup may run up to ten minutes after expiry while the service runs; offline time delays cleanup. Restoration is rejected as soon as the deadline passes, independently of cleanup timing.

Foreign-key dependency order: invitation delivery → notification jobs → Discord bindings → invitations → notifications → memberships → group-local events → group. Accounts, OAuth identities, sessions, global push subscriptions and shared general events are preserved. A minimal tombstone retains the old group ID and slug, deadline and purge timestamps, but clears the display name and deleting actor. Old slugs remain reserved to prevent old invitations/bookmarks being reused by a new group. Audit history remains. Backups are retained independently; this is not a promise to erase every historical copy.

The legacy importer continues refreshing shared general dates while refusing to recreate group activities for a trashed/purged legacy calendar. The bootstrap also respects tombstones. Restoring the legacy calendar resumes its existing source integration.

## Operational boundaries

This feature stops the calendar website's grouped notification pipeline. The original legacy Discord bot scheduler is separate and is not switched by this feature (`CALENDAR_GROUPS_ENABLED` migration remains a separate operation). Main server-panel APIs expose trash metadata and prohibit mutations; this change does not add a restore interface to the bot repository's server panel.

Deployment backs up the live SQLite database and replaced source files before restart. Do not exercise destructive flows on real calendars for deployment checks. This implementation was reviewed and deployed without deleting an existing calendar; an isolated delete/restore/expiry integration test remains to be performed when explicitly requested.


## Workflow update — 10 October 2026

See [Current workflow guide](WORKFLOWS.md) and [คู่มือภาษาไทย](WORKFLOWS.th.md). These replace earlier descriptions of immediate ordinary owner transfer, hard activity deletion and single-group-only display. Grouped Discord worker cutover remains pending; no Git push is part of this update.
