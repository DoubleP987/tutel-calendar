# User guide

[ภาษาไทย](USER-GUIDE.th.md) · [Operational status](CURRENT-STATUS.md)

## Contents

1. Open and sign in
2. Navigation and categories
3. Groups
4. Invitations
5. Activities and approval
6. Reminders

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

Email invitations match the provider-verified address at sign-in. They do not fabricate accounts. CSV adds pending assignments without bulk emails. Existing memberships and suspensions are respected. Revoke unused invitations in history.

## 5. Activities and approval

Choose a date or Add activity. Enter title, description, dates, all-day or start/end times, category and color. Approval follows the group's manual/trusted/all policy. Check My activities for proposal status. Managers review pending submissions. Policy changes apply to new proposals, not old pending records.

Imported general dates are read-only for members. Fix them at the source; corrections become visible to all groups on their next fetch. Native activities remain in their group.

## 6. Reminders

My settings provides notification categories, lead time and all-day time. Display and reminder categories are separate. All-day reminders occur the previous day at 12:00 and on the date at the configured time, default 07:00, Asia/Bangkok. Manager settings control review notifications.

Device notification permission is separate. The inbox remains available when system Push/badging is unsupported. Delivery depends on server uptime, permission and browser/device support. See NOTIFICATIONS.md and CURRENT-STATUS.md for verified limits.
