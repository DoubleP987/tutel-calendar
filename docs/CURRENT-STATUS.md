# Current status — 12 October 2026

[Current feature guide / คู่มือคุณสมบัติปัจจุบัน](CURRENT-FEATURES.md)

Calendar web runs on homeserver through its existing HTTPS tunnel. Public general dates are shared once; selected groups hold their own activities. Google/Discord OAuth, queued invitations and accepted email delivery have been configured. One explicitly authorized Gmail invitation was observed in the inbox; no mass CSV test was sent.

Implemented: mobile sidebar/themes, initial loading screen and installation guide, public default without CS SKRU selection, calendar trash with 30-day recovery, leaving/removing members, seven-day accepted ownership transfer, CSV existing-member skip, multi-group display, event drafts/cancellation/trash/history, bounded virtual recurrence and occurrence exceptions, JSON export, daily web summaries and quiet hours, account linking/unlinking and session controls.

See WORKFLOWS.md and WORKFLOWS.th.md for exact scope and API contracts. Calendar workflow changes were reviewed/formatted and the service startup is checked after deployment. No destructive calendar/member/ownership production test was performed. Physical-device installation/Push validation remains pending.

Grouped Discord worker is enabled on homeserver. Legacy reminders are disabled in the runtime and the two existing shared database configurations. No old channel is migrated automatically: connect each group with `/calendar connect calendar:https://calendar.toomtoom.online/g/<slug>`. Calendar owns the integration and optional standalone bot runtime; it currently shares the existing music bot connection. No group channel was connected merely for verification. See DISCORD-CALENDAR-BOT.md. Website hosting does not fail over to Oracle. Main server-panel APIs remain privileged and separate from group managers.

Music Loop default is off for guilds without a saved preference. Skip in a one-song loop restarts that song; a queued successor takes priority when skipping a song loop. Intentional decoder termination no longer marks playback failed. Nineteen relevant automated regressions passed; actual Discord audio was not exercised by synthetic tests. See repository history for source publication; runtime deployment is separate.

## Group history and directory (10 October 2026)

All authorized group members can read member names, group roles and join timestamps, and a paginated activity history with actor names, item titles and Bangkok timestamps. Management writes remain restricted. New audit snapshots preserve readable names after item deletion; old actions are not reconstructed. No invitation tokens or email addresses are exposed. See [Group history and directory](GROUP-HISTORY.md) for API changes, implementation and retention limitations. Server source changes require a restart as part of deployment.

## Feedback, identity, scheduled reminders and source cleanup

The homeserver has the Feedback submission/inbox integration, custom display names with privileged original-name/email detail, any-account single-use email/link invitations, own-event editing shortcut, scheduled-only event notifications and a copy-calendar-link control for all authorized viewers. Existing inbox history remains intact. Website hosting remains on homeserver; no Oracle work is part of this cleanup.

The new project-wide readability pass reformats control-flow blocks, local declarations, embedded HTML and long SQL. It is included in the homeserver deployment; formatter/syntax validation is not end-to-end behavioral testing. See CURRENT-FEATURES.md and CODE-STYLE.md.

## Group administration and announcements — 12 October

Owner-granted external assistants can read/delete native group activities without joining or receiving notifications. Owners can send manual announcements and authorize selected managers. Main Panel manages all accounts/groups, sessions and memberships, and can permanently delete suspended groups after exact-name confirmation. The new dashboard includes Discord counts. See [permissions and announcements](ANNOUNCEMENTS-AND-ADMIN.md).

Production UI/startup and syntax were inspected; no real group was deleted, no role was granted and no announcement was sent for verification. Physical-device Push and the optional standalone-token runtime have not been exercised end to end. Backups precede the release; see [rollback](ROLLBACK.md).
