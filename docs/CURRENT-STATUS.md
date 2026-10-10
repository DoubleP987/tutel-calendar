# Current status — 10 October 2026

[Current feature guide / คู่มือคุณสมบัติปัจจุบัน](CURRENT-FEATURES.md)

Calendar web runs on homeserver through its existing HTTPS tunnel. Public general dates are shared once; selected groups hold their own activities. Google/Discord OAuth, queued invitations and accepted email delivery have been configured. One explicitly authorized Gmail invitation was observed in the inbox; no mass CSV test was sent.

Implemented: mobile sidebar/themes, initial loading screen and installation guide, public default without CS SKRU selection, calendar trash with 30-day recovery, leaving/removing members, seven-day accepted ownership transfer, CSV existing-member skip, multi-group display, event drafts/cancellation/trash/history, bounded virtual recurrence and occurrence exceptions, JSON export, daily web summaries and quiet hours, account linking/unlinking and session controls.

See WORKFLOWS.md and WORKFLOWS.th.md for exact scope and API contracts. Calendar workflow changes were reviewed/formatted and the service startup is checked after deployment. No destructive calendar/member/ownership production test was performed. Physical-device installation/Push validation remains pending.

Grouped Discord worker is prepared but not enabled: CALENDAR_GROUPS_ENABLED=0 remains until legacy channel migration and coordinated bot-host cutover. Original Discord reminders are separate and are not automatically disabled by web group deletion. Calendar OAuth app is not a second bot runtime. Website hosting does not fail over to Oracle. Main server-panel APIs remain privileged and separate from group managers.

Music Loop default is off for guilds without a saved preference. Skip in a one-song loop restarts that song; a queued successor takes priority when skipping a song loop. Intentional decoder termination no longer marks playback failed. Nineteen relevant automated regressions passed; actual Discord audio was not exercised by synthetic tests. See repository history for source publication; runtime deployment is separate.

## Group history and directory (10 October 2026)

All authorized group members can read member names, group roles and join timestamps, and a paginated activity history with actor names, item titles and Bangkok timestamps. Management writes remain restricted. New audit snapshots preserve readable names after item deletion; old actions are not reconstructed. No invitation tokens or email addresses are exposed. See [Group history and directory](GROUP-HISTORY.md) for API changes, implementation and retention limitations. Server source changes require a restart as part of deployment.

## Feedback, identity, scheduled reminders and source cleanup

The homeserver has the Feedback submission/inbox integration, custom display names with privileged original-name/email detail, any-account single-use email/link invitations, own-event editing shortcut, scheduled-only event notifications and a copy-calendar-link control for all authorized viewers. Existing inbox history remains intact. Website hosting remains on homeserver; no Oracle work is part of this cleanup.

The new project-wide readability pass reformats control-flow blocks, local declarations, embedded HTML and long SQL. It is a local source change until a separate deployment; formatter/syntax validation is not end-to-end behavioral testing. See CURRENT-FEATURES.md and CODE-STYLE.md.
