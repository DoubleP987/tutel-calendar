# API v0.1.0

[Current feature guide / คู่มือคุณสมบัติปัจจุบัน](CURRENT-FEATURES.md)

## Invitation/account update — 10 October 2026

Email/link invitations now accept any signed-in Google/Discord account, require explicit acceptance and allow one successful use. Automatic email-matched joining has been removed. Users can set a persistent display name; managers additionally see the original provider name and verified email. See [current behavior and API](INVITATIONS-AND-PROFILE.md). This replaces older descriptions of preassignment and email-matching below.

## Group integration update — 10 October 2026

Calendar web/groups/invitations/mobile sidebar/shared dates are deployed on homeserver. Grouped Discord reminder worker cutover remains pending; the privileged Calendar bridge and Feedback inbox in the private panel are implemented. Read [current Calendar status](https://github.com/DoubleP987/tutel-calendar/blob/main/docs/CURRENT-STATUS.md).

> Calendar source is deployed independently; bot worker cutover remains pending. Current status is documented in the Calendar repository.

Same-origin JSON API. All authenticated mutations require `x-csrf-token` returned by `/api/session` and the session cookie. Public and authenticated reads use `Cache-Control: no-store`.

| Endpoint                       | Permission                               | Purpose                                                                                  |
| ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/session`             | Anyone                                   | Current user, CSRF, configured providers, demo mode                                      |
| `GET /api/events`              | Anyone                                   | Shared general dates plus authorized group activities                                    |
| `GET /api/mine`                | Member                                   | Own proposals and results                                                                |
| `POST /api/events`             | Member + CSRF                            | Validated proposal; pending or published according to manual/trusted/all approval policy |
| `GET /api/review`              | Manager                                  | Pending review queue                                                                     |
| `POST /api/review/:id`         | Manager + CSRF                           | Publish or reject a pending proposal                                                     |
| `POST /api/logout`             | Member + CSRF                            | Revoke current session                                                                   |
| `POST /api/demo`               | Loopback demo only + same-origin request | Preview member or manager                                                                |
| `GET /auth/google`             | Anyone, configured provider              | Begin Google authorization                                                               |
| `GET /auth/discord`            | Anyone, configured provider              | Begin Discord authorization                                                              |
| `GET /auth/:provider/callback` | Valid state/browser binding              | Exchange code and create session                                                         |
| `GET /api/health`              | Anyone                                   | Local service version and availability                                                   |

Create event body:

```json
{
  "title": "ประชุมทีม",
  "description": "ห้องประชุม",
  "date": "2026-10-12",
  "endDate": "2026-10-12",
  "allDay": false,
  "time": "10:00",
  "endTime": "11:00",
  "color": "#4285f4",
  "category": "academic"
}
```

Default categories: academic, community, important, holiday; allowed IDs are in /api/catalog. End date is inclusive for all-day/multi-day display. Timed same-day events require end time later than start time. Titles max 160 chars, descriptions max 2,000. No client-supplied status, owner, reviewer or role is accepted in a proposal.

Review body: `{ "status": "published", "note": "" }` or `{ "status": "rejected", "note": "เหตุผล" }`. The update only matches pending records; a repeated review receives 409 rather than silently changing an already-reviewed event.

Typical status codes: 401 not authenticated, 403 unauthorized/CSRF, 400 validation, 409 stale review, 429 daily submission limit.

## Added settings and notification routes

| Endpoint                       | Permission     | Purpose                                        |
| ------------------------------ | -------------- | ---------------------------------------------- |
| GET /api/catalog               | Public         | Category labels and defaults                   |
| GET /api/preferences           | Member         | Persisted display/reminder preferences         |
| PUT /api/preferences           | Member + CSRF  | Save own preferences                           |
| GET /api/members               | Group member   | Same-group members, roles and joined_at        |
| PUT /api/members/:id           | Manager + CSRF | Set role, autoApprove, blocked                 |
| GET /api/admin-settings        | Manager        | Calendar-wide approval/notification settings   |
| PUT /api/admin-settings        | Manager + CSRF | Approval manual/trusted/all and manager alerts |
| GET /api/notifications         | Member         | Own inbox and unread count                     |
| POST /api/notifications/read   | Member + CSRF  | Mark own messages read                         |
| GET /api/push-key              | Member         | Public VAPID key only                          |
| POST /api/push-subscriptions   | Member + CSRF  | Register current device                        |
| DELETE /api/push-subscriptions | Member + CSRF  | Unregister own device                          |
| POST /api/push-test            | Member + CSRF  | Enqueue a notification for current member      |

Approval policy may now publish a new proposal automatically. The POST events response includes the actual resulting status. Existing pending proposals are not bulk-published by switching policy. Expanded category IDs are provided by catalog, including islamic; the old four-item list above describes initial defaults only.

## Group context and shared dates

Use x-calendar-group (ID/slug), query group or the saved last group. groupContext validates existence, suspension and membership. A selector is not permission. GET /api/events returns shared published dates plus selected-group published activities for members. Non-member public-group reads return shared dates only; private groups reject non-members. Rows carry data_scope and stable IDs. Shared storage group_id does not describe the viewing group. This is not a multi-group aggregation API.

GET /api/groups lists memberships; POST /api/groups creates a private group; GET /api/group reads context; POST /api/group/select saves selection. POST /api/invitations sends automatically for kind=email; the web route needs no sendEmail checkbox. Link/code results are for copying. See GROUPS.md for account linking, CSV, bindings and internal jobs.

## Workflow update — 10 October 2026

See [Current workflow guide](WORKFLOWS.md) and [คู่มือภาษาไทย](WORKFLOWS.th.md). These replace earlier descriptions of immediate ordinary owner transfer, hard activity deletion and single-group-only display. Grouped Discord worker cutover remains pending; Source publication and runtime deployment are separate operations.

## Member-readable history

`GET /api/group/audit?page=1` now requires group membership, rather than management privilege, and returns `{ items, page, hasMore }` instead of the old bare array. Page size is 50. Public item fields are `id`, `action`, `created_at`, `actor_name`, `target_name`; raw actor/target identifiers are omitted. All callers must use `result.items`. `GET /api/members` adds `joined_at`; writes still require management and CSRF. Both routes reject nonmembers even for public calendars. See [GROUP-HISTORY.md](GROUP-HISTORY.md).

## Profile, Feedback and view links (10 October 2026)

| Endpoint                       | Contract                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `GET /api/account/profile`     | Own name, customName and providerName; authenticated session                               |
| `PUT /api/account/profile`     | CSRF-protected `{name}`; 100-character display name or empty reset                         |
| `GET /api/events`              | Includes permission-derived `can_edit`; writes still enforce server authorization          |
| `POST /api/feedback`           | Member session + CSRF; multipart category/title/message/groupId/pagePath + optional images |
| `GET /api/feedback/images/:id` | Private sender image read; see FEEDBACK.md for the exact route contract                    |
| `/g/:slug`                     | Group viewing context; public visibility or authorized membership still required           |

Main-panel Feedback access uses the separate service-control contract, not group manager roles. See [FEEDBACK.md](FEEDBACK.md), [INVITATIONS-AND-PROFILE.md](INVITATIONS-AND-PROFILE.md), [REMINDERS.md](REMINDERS.md) and [CODE-STYLE.md](CODE-STYLE.md).
