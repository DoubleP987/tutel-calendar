# Source readability / แนวทางเขียนโค้ดให้อ่านง่าย

Updated 10 October 2026. These conventions apply to the entire repository.

## Formatting

- ESM JavaScript, explicit `.js` imports, two spaces, LF, semicolons and single quotes.
- Prettier uses a 100-column target. HTML uses `htmlWhitespaceSensitivity: ignore` so nested tags can occupy separate lines.
- Use `npm run format` before review and `npm run format:check` to inspect consistency. Formatting does not prove runtime correctness.
- Keep credentials, runtime databases, uploads, backups and generated lockfiles outside formatter input where configured.

## Reading order inside a module

1. Imports and configuration constants.
2. Small helpers with a single clear responsibility.
3. Exported registration/setup functions and the workflows they coordinate.
4. Resource teardown beside the code that owns the resource.

Use one declaration per statement. Give related declarations one paragraph; separate validation, state changes, I/O and rendering with blank lines. Every `if`, `else` and loop body has braces, including early returns. Leave `else if` as one chain. Do not add blank lines after every statement.

## HTML in JavaScript

Mark static HTML templates with `/* HTML */` so Prettier also formats the nested markup. Long forms should be a named template constant. Attributes wrap when needed and closing tags remain aligned. This comment is a formatting hint, **not** an HTML sanitizer.

```js
const FORM = /* HTML */ `
  <form class="example-form">
    <label>
      Title
      <input name="title" required />
    </label>
    <button type="submit">Save</button>
  </form>
`;

function renderName(element, name) {
  element.textContent = name;
}
```

Use `textContent`/DOM creation for user-controlled text. Never interpolate submitted titles, names or messages into trusted markup. Preserve DOM identifiers, permission checks and cache-version conventions while reorganizing source.

## SQL and authorization

Put long SQL into multiline templates with clauses and field lists separated. Keep bound placeholders and `.get/.all/.run` arguments in matching order. Do not interpolate user input into SQL or construct arbitrary table/column names.

```js
const query = db.prepare(`
  SELECT id, name
  FROM users
  WHERE id = ?
`);

const user = query.get(userId);
```

This illustration explains formatting; it is not a replacement for a route's authentication, group authorization, CSRF or input validation. SQLite SQL whitespace can be reformatted outside quoted values; strings inside quotes must stay unchanged.

## Boundaries and comments

Keep HTTP handlers, domain decisions, persistence and browser presentation in their existing feature folders. The music repository owns Discord audio and the private server panel. Calendar owns web accounts, groups, activities, Feedback storage and SQLite. Communicate through the existing protected HTTP contract; never share a live SQLite file or browser-visible service secret.

Comments explain intent, resource ownership, security assumptions and edge cases. Avoid narrating obvious assignments. Split a large function when a named workflow boundary exists; moving lines solely to make a file shorter creates unnecessary indirection.

## ภาษาไทย

โค้ดหนึ่งย่อหน้าควรทำหน้าที่เดียว เช่น เตรียมข้อมูล ตรวจสิทธิ์ ตรวจ input บันทึกข้อมูล หรือวาดหน้า เว้นบรรทัดเมื่อเปลี่ยนหน้าที่ ใช้ชื่อที่อ่านแล้วรู้ว่าเก็บอะไร แยกตัวแปรแต่ละตัว และใส่วงเล็บปีกกาทุกเงื่อนไข/ลูป เพื่อให้เห็นขอบเขตชัดเจน

HTML ที่อยู่ใน JavaScript ต้องจัด nested tags ด้วย ไม่ใช่จัดเฉพาะ JavaScript รอบนอก ส่วน SQL ยาวแบ่ง SELECT/FROM/JOIN/WHERE และรายการคอลัมน์ แต่ยังต้องใช้ parameter binding เหมือนเดิม การจัดรูปแบบไม่ใช่การอุดช่องโหว่ และไม่ใช่การทดสอบเสียง OAuth หรือการส่งอีเมล
