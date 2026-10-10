# Group history and member directory

## For members

Choose a calendar group, then open **Members and roles** or **Group history** in the sidebar. All signed-in, non-blocked members of that group can read these pages, including editors and ordinary members. Public calendar visitors and members of other groups cannot read them. Platform administrators retain their existing management access.

The directory shows display name, account provider, group role, suspension status and join date/time. Joining time belongs to this membership, not account registration. Rejoining after leaving creates a new membership time. Existing migrated memberships may show their migration time. Managers and owners have management controls; reading the directory does not grant permission to change roles, remove members or access the server panel.

History shows who joined, created, updated, reviewed, cancelled, deleted or restored items, and membership/invitation/Discord setting actions already recorded by the application. It uses readable labels, names and dates in Asia/Bangkok. Newest entries appear first, with 50 entries per page and Previous/Next controls. Names and event titles are snapshots for new records, so renaming or deleting an item does not erase its meaning. Names identify a display name at the time; they are not verified legal identities.

No email addresses, invitation links/codes/tokens, OAuth credentials, event descriptions or server logs appear in this page. Group members can see titles of actions recorded for the group, including pending proposals. This is intentional group transparency. Historical records without snapshots use names still available in storage; missing names receive a generic label. The application cannot reconstruct actions never recorded. Join dates remain available in the directory even when old joins have no audit entry. There is no member-facing delete-history API. This is an application activity record, not a tamper-proof security log or complete change diff.

## For developers

- `src/groups/schema.js`: additive `audit_snapshots` table; existing six-column `audit_log` remains compatible. The composite history index supports group/date ordering. `recordAudit` captures only display names and target titles, never invitation payloads.
- `src/members/routes.js`: read guards require authentication and authorized group context. Write guards still require management privileges and CSRF. `GET /api/members` includes `joined_at`. `GET /api/group/audit?page=1` returns `{ items, page, hasMore }`; each item has `id`, `action`, `created_at`, `actor_name`, `target_name`. Page numbers must be integers 1-100000. IDs/tokens of invitation targets are excluded from this response.
- `src/groups/invitations.js` and `routes.js`: new memberships accepted through invites and calendar creation record `membership.joined`; accepting an invite as an existing member does not generate a new join.
- `public/history.js`: shared, text-only DOM renderer and Bangkok time formatting. Both sidebar history and the manager dialog use it. `public/settings.js` separates directory reading from management controls. History fetches retain group scope and ignore responses after switching groups.

Back up SQLite before upgrades. Tables/indexes are created at normal server startup; no manual SQL or secret configuration is required. A server restart and refreshed frontend are required to use these changes on a running host. Existing audits are preserved and are not fabricated or rewritten. Snapshot data remains subject to the project's database retention/backup policies.
