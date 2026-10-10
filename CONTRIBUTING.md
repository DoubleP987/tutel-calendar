# Contributing to Tutel Calendar / แนวทางส่งงาน

[Developer handbook](docs/DEVELOPMENT.md) · [คู่มือผู้พัฒนา](docs/DEVELOPMENT.th.md) · [Current status](docs/CURRENT-STATUS.md)

## Development boundaries / ขอบเขต

Use a loopback demo with a separate database or an explicitly configured development OAuth environment. Disable outbound production SMTP, Push and service keys in development. Never use a copied production database as a fixture. The music bot and private server panel are maintained in a separate repository.

## Working changes / ขั้นตอนทำงาน

1. Create a branch for one behavior.
2. Identify server authorization, schema and public API consequences first.
3. Add validation and server guards; browser controls alone do not enforce access.
4. Update frontend state, serializers and settings consistently.
5. Document migrations, shared-data behavior and bot contract changes.
6. Use Prettier on touched files; avoid unrelated formatting.

Shared general dates must remain one dataset. User-added holiday-category activities remain private/group-scoped. A group ID/header is a selector, not permission. No secret may be sent to browser code.

## Verification / ตรวจงาน

Calendar includes an isolated group-history test file, but no complete application test suite or npm test script. Follow DEVELOPMENT.md's syntax/format and manual acceptance guidance when verification is requested. Use an isolated database and mock/injected network services for future tests. Record what was actually checked; health/format success is not proof of group isolation, mail delivery or OAuth correctness.

## Review and commit / ตรวจและ commit

```powershell
git diff
git add docs/DEVELOPMENT.md
git diff --cached --name-only
git diff --cached
git commit -m "docs: improve developer setup"
```

Use the actual affected paths/message. The PR should describe behavior, permissions, schema/API impact, checks performed, unverified limits and rollback. Cross-link changes to the bot worker/client when the service contract changes.

## Secrets and generated data / ข้อมูลลับ

Do not commit .env, OAuth/SMTP/service/tunnel keys, SQLite/WAL, sessions, subscriptions, invitation tokens, backups or node_modules. Secret values in examples stay blank. Scan generated artifacts and history before public push. .gitignore does not undo earlier exposure; published credentials require owner-led revocation/rotation and an explicit history plan.

## Release / ปล่อยงาน

Update CURRENT-STATUS.md only with observed deployment facts. Preserve production .env/data and make a consistent SQLite backup before restart/migration. Version cached UI assets together. Do not send test invitations to real people without authorization. Calendar source publication does not activate the Discord worker or website failover.

ภาษาไทย: PR ต้องบอกสิทธิ์ที่เปลี่ยนและแผนย้อนกลับ ชุดข้อมูลวันกลางไม่ clone การเพิ่ม test ต้องไม่ยิง production service และไม่รายงานงานค้างว่าเสร็จเพียงเพราะขึ้น Git แล้ว

## Readability / การจัดโค้ด

Follow [CODE-STYLE.md](docs/CODE-STYLE.md) for JavaScript blocks, embedded HTML, safe SQL formatting and logical paragraphs. The project-wide cleanup was explicitly requested; future changes should format only their relevant files.
