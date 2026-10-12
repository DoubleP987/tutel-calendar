import { manageCapabilities } from './group-notices.js?v=20261012';
import { workspaceUI } from './workspace.js?v=20261010-workflows';
import { renderGroupHistory } from './history.js?v=20261010-history';

const labels = { owner: 'เจ้าของ', manager: 'ผู้จัดการ', editor: 'ผู้แก้ไข', member: 'สมาชิก' };

/** Group navigation and invitation workflows share the calendar's scoped API helper. */
export function groupsUI({ api, state, element, toast, reload, editEvent }) {
  const $ = (selector) => document.querySelector(selector);

  const dialog = element('dialog');
  dialog.id = 'groups-dialog';
  document.body.append(dialog);
  let selectedCsv = '';
  let csvRows = [];

  function button(text, action, className = '') {
    const node = element('button', className, text);
    node.type = 'button';

    node.onclick = () =>
      Promise.resolve()
        .then(action)
        .catch((error) => toast(error.message));

    return node;
  }

  function chevron() {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 20 20');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('class', 'group-trigger-arrow');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5 7.5 10 12.5 15 7.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    icon.append(path);
    return icon;
  }

  function field(form, label, name, type = 'text', value = '') {
    const row = element('label', '', label);
    const input = element('input');
    input.name = name;
    input.type = type;
    input.value = value;
    row.append(input);
    form.append(row);
    return input;
  }

  function open(title) {
    dialog.replaceChildren();
    const head = element('div', 'dialog-header');
    head.append(
      element('h2', '', title),
      button('×', () => dialog.close(), 'close'),
    );
    const body = element('div', 'form-content');
    dialog.append(head, body);

    if (!dialog.open) {
      dialog.showModal();
    }

    return body;
  }

  function form(body, submit) {
    const node = element('form', 'group-form');

    node.onsubmit = async (event) => {
      event.preventDefault();
      const send = node.querySelector('[type=submit]');

      if (send) {
        send.disabled = true;
      }

      try {
        await submit(node);
      } catch (error) {
        toast(error.message);
      } finally {
        if (send) {
          send.disabled = false;
        }
      }
    };

    body.append(node);
    return node;
  }

  function submit(node, text) {
    const b = element('button', 'primary', text);
    b.type = 'submit';
    node.append(b);
  }

  function select(form, label, name, options, value) {
    const row = element('label', '', label);
    const input = element('select');
    input.name = name;

    for (const [id, title] of options) {
      const item = element('option', '', title);
      item.value = id;
      input.append(item);
    }

    input.value = value;
    row.append(input);
    form.append(row);
    return input;
  }

  function showSecret(body, value) {
    const box = element('input', 'invite-result');
    box.value = value;
    box.readOnly = true;
    box.setAttribute('aria-label', 'ลิงก์หรือรหัสเชิญ');
    body.append(
      box,
      button('คัดลอก', async () => {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(value);
        } else {
          box.select();
          document.execCommand('copy');
        }

        toast('คัดลอกแล้ว');
      }),
    );
  }

  const workspace = workspaceUI({ api, state, element, toast, reload, open, button, editEvent });

  async function create() {
    if (!state.session.user) {
      $('#login-dialog').showModal();
      return;
    }

    const body = open('สร้างกลุ่มของคุณ');
    const node = form(body, async (f) => {
      const group = await api('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: f.elements.name.value, slug: f.elements.slug.value }),
      });
      dialog.close();
      state.groupId = group.id;
      history.pushState(null, '', `/g/${group.slug}`);
      await reload();
      toast('สร้างกลุ่มส่วนตัวแล้ว');
    });
    field(node, 'ชื่อกลุ่ม', 'name').required = true;
    const slug = field(node, 'ชื่อในลิงก์ เช่น project-team', 'slug');
    slug.required = true;
    slug.pattern = '[a-z0-9][a-z0-9-]{2,47}';
    node.append(element('p', 'fine', 'กลุ่มใหม่เป็นส่วนตัว เข้าร่วมได้ผ่านคำเชิญเท่านั้น'));
    submit(node, 'สร้างกลุ่ม');
  }

  async function join(token = '') {
    const body = open('เข้าร่วมด้วยคำเชิญ');

    if (!state.session.user) {
      body.append(
        element('p', '', 'เข้าสู่ระบบก่อนรับคำเชิญ'),
        button('เข้าสู่ระบบ', () => {
          $('#login-dialog').showModal();
        }),
      );
      return;
    }

    const node = form(body, async (f) => {
      let value = f.elements.token.value.trim();

      try {
        const url = new URL(value);
        value = url.pathname.split('/invite/')[1] || value;
      } catch {}

      const group = await api('/api/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token: value }),
      });
      dialog.close();
      state.groupId = group.id;
      history.replaceState(null, '', `/g/${group.slug}`);
      await reload();
      toast('เข้าร่วมกลุ่มแล้ว');
    });
    field(node, 'ลิงก์เชิญหรือรหัสกลุ่ม', 'token', 'text', token).required = true;
    submit(node, 'รับคำเชิญ');
  }

  async function invites() {
    const body = open(`เชิญสมาชิก · ${state.group.name}`);
    const node = form(body, async (f) => {
      const kind = f.elements.kind.value;
      const invitation = await api('/api/invitations', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          email: kind === 'email' ? f.elements.email.value : '',
          role: f.elements.role.value,
          days: Number(f.elements.days.value),
          maxUses: kind === 'code' ? Number(f.elements.maxUses.value) : 1,
        }),
      });
      body.replaceChildren();
      const sent = invitation.delivery.status === 'sent';
      const queued = invitation.delivery.status === 'queued';
      const failed = kind === 'email' && !sent && !queued;
      const title =
        kind === 'email'
          ? queued
            ? 'กำลังส่งคำเชิญทางอีเมล'
            : sent
              ? 'ส่งคำเชิญแล้ว'
              : 'สร้างคำเชิญแล้ว แต่ส่งอีเมลไม่สำเร็จ'
          : kind === 'code'
            ? 'รหัสเข้าร่วมพร้อมแล้ว'
            : 'ลิงก์เชิญพร้อมแล้ว';
      body.append(element('h3', 'invite-result-title', title));

      if (kind === 'email') {
        body.append(
          element(
            'p',
            'fine',
            queued
              ? `เพิ่ม ${invitation.email} เข้าคิวส่งแล้ว ดูผลได้ในคำเชิญทั้งหมด หากไม่พบเมลให้ตรวจจดหมายขยะด้วย`
              : sent
                ? `ส่งลิงก์เข้าร่วมไปที่ ${invitation.email} แล้ว ใช้ Google หรือ Discord บัญชีใดก็ได้ ลิงก์ใช้ได้ 1 ครั้ง`
                : 'ยังไม่ได้ส่งถึงผู้รับ คุณสามารถคัดลอกลิงก์ด้านล่างไปให้ผู้รับโดยตรงได้',
          ),
        );
      } else {
        body.append(
          element(
            'p',
            'fine',
            kind === 'code'
              ? 'ส่งรหัสนี้ให้ผู้รับ แล้วให้เลือกเข้าร่วมด้วยคำเชิญ'
              : 'คัดลอกลิงก์นี้ส่งให้คนที่ต้องการเชิญ ผู้รับต้องเข้าสู่ระบบก่อนเข้าร่วม',
          ),
        );
      }

      if (!sent && !queued) {
        showSecret(body, kind === 'code' ? invitation.token : invitation.url);
      }

      const actions = element('div', 'invite-footer');
      actions.append(
        button('เชิญคนอื่น', invites),
        button('ดูคำเชิญทั้งหมด', listInvites),
        button('เสร็จสิ้น', () => dialog.close(), 'primary'),
      );
      body.append(actions);
      toast(failed ? 'ส่งอีเมลไม่สำเร็จ แต่ลิงก์เชิญยังใช้ได้' : title);
    });
    select(
      node,
      'วิธีเชิญ',
      'kind',
      [
        ['link', 'สร้างลิงก์เชิญ'],
        ['email', 'ส่งคำเชิญทางอีเมล'],
        ['code', 'สร้างรหัสเข้าร่วม'],
      ],
      'link',
    );
    const hint = element('p', 'fine invite-method-hint');
    node.append(hint);
    const email = field(node, 'อีเมลผู้รับ', 'email', 'email');
    email.autocomplete = 'email';
    email.placeholder = 'name@example.com';
    select(
      node,
      'สิทธิ์ของผู้รับ',
      'role',
      [
        ['member', 'สมาชิก'],
        ['editor', 'ผู้แก้ไข'],
        ...(state.group.role === 'owner' ? [['manager', 'ผู้จัดการ']] : []),
      ],
      'member',
    );
    const options = element('details', 'invite-options');
    options.append(element('summary', '', 'อายุคำเชิญและจำนวนผู้เข้าร่วม'));
    node.append(options);
    const days = field(options, 'ใช้ได้กี่วัน', 'days', 'number', '7');
    days.min = 1;
    days.max = 30;
    const uses = field(options, 'จำนวนผู้เข้าร่วมสูงสุด', 'maxUses', 'number', '1');
    uses.min = 1;
    uses.max = 500;
    submit(node, 'สร้างลิงก์เชิญ');

    const updateMethod = () => {
      const kind = node.elements.kind.value;
      email.parentElement.hidden = kind !== 'email';
      email.required = kind === 'email';
      uses.parentElement.hidden = kind !== 'code';
      node.querySelector('[type=submit]').textContent =
        kind === 'email' ? 'ส่งคำเชิญ' : kind === 'code' ? 'สร้างรหัสเข้าร่วม' : 'สร้างลิงก์เชิญ';
      hint.textContent =
        kind === 'email'
          ? 'ส่งลิงก์ให้ผู้รับ ใช้ Google หรือ Discord บัญชีใดก็ได้ ลิงก์ใช้ได้ 1 ครั้ง'
          : kind === 'code'
            ? 'สร้างรหัสสำหรับส่งให้สมาชิก ใช้รหัสเพื่อเข้าร่วมกลุ่ม'
            : 'สร้างลิงก์ใช้ได้ 1 ครั้ง ผู้ที่มีลิงก์เข้าสู่ระบบด้วย Google หรือ Discord บัญชีใดก็ได้';
    };

    node.elements.kind.onchange = updateMethod;
    updateMethod();
    const tools = element('div', 'invite-footer');
    tools.append(button('ดูคำเชิญทั้งหมด', listInvites), button('นำเข้ารายชื่อ CSV', csv));
    body.append(tools);
  }

  async function listInvites() {
    const body = open('คำเชิญของกลุ่ม');
    const items = await api('/api/invitations');
    body.append(button('＋ เชิญสมาชิก', invites), button('รีเฟรชสถานะการส่ง', listInvites));

    for (const invite of items) {
      const card = element('article', 'proposal');
      const expired = invite.expires_at <= Date.now();
      const used = invite.uses >= invite.max_uses;
      const ended = invite.revoked || expired || used;
      const status = invite.revoked
        ? 'ยกเลิกแล้ว'
        : used
          ? 'ใช้ครบแล้ว'
          : expired
            ? 'หมดอายุ'
            : 'ใช้งานได้';
      const types = { email: 'คำเชิญทางอีเมล', link: 'ลิงก์เชิญ', code: 'รหัสเข้าร่วม' };
      card.append(
        element('h3', '', invite.email || types[invite.kind]),
        element(
          'p',
          'fine',
          `${status} · ${labels[invite.role]} · ใช้ ${invite.uses}/${invite.max_uses}`,
        ),
        element(
          'p',
          'fine',
          `หมดอายุ ${new Date(invite.expires_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
        ),
      );

      if (invite.kind === 'email') {
        const deliveryLabels = {
          queued: 'รอส่ง',
          sending: 'กำลังส่ง',
          sent: 'ผู้ให้บริการรับอีเมลแล้ว (ยังไม่ยืนยันว่าเข้ากล่องขาเข้า)',
          failed: 'ส่งไม่สำเร็จ',
          uncertain: 'ไม่ทราบผลการส่ง',
          cancelled: 'ยกเลิกการส่ง',
          'not-configured': 'ยังไม่ได้ตั้งค่า SMTP',
          'invalid-configuration': 'ตั้งค่า SMTP ไม่ถูกต้อง',
        };
        card.append(
          element(
            'p',
            'fine',
            `อีเมล: ${deliveryLabels[invite.delivery_state] || 'ยังไม่มีประวัติการส่ง'}${invite.delivery_reason ? ' · ' + invite.delivery_reason : ''}`,
          ),
        );

        if (!ended && !['queued', 'sending'].includes(invite.delivery_state)) {
          card.append(
            button('ส่งอีเมลอีกครั้ง', async () => {
              if (!window.confirm('ส่งคำเชิญอีกครั้ง? ลิงก์ในอีเมลเดิมจะใช้ไม่ได้')) {
                return;
              }

              await api(`/api/invitations/${invite.id}/resend`, { method: 'POST' });
              toast('เข้าคิวส่งอีเมลแล้ว');
              await listInvites();
            }),
          );
        }
      }

      if (!ended) {
        card.append(
          button('ยกเลิกคำเชิญ', async () => {
            await api(`/api/invitations/${invite.id}`, { method: 'DELETE' });
            await listInvites();
          }),
        );
      }

      body.append(card);
    }

    if (!items.length) {
      body.append(element('p', 'empty', 'ยังไม่มีคำเชิญ'));
    }
  }

  async function csv() {
    const body = open('นำเข้ารายชื่อ CSV');
    body.append(
      element(
        'p',
        'fine',
        'สร้างคำเชิญและส่งอีเมลให้แต่ละคนตามคิว เมื่อเข้าสู่ระบบด้วยอีเมลตรงกันจะเข้ากลุ่มได้ · หัวตาราง email,name,role · role เป็น member หรือ editor · สูงสุด 500 คน · การส่งขึ้นกับโควตาผู้ให้บริการ',
      ),
    );
    const file = element('input');
    file.type = 'file';
    file.accept = '.csv,text/csv';
    body.append(file);
    const preview = element('div', 'cards');
    body.append(preview);
    let confirm;

    file.onchange = async () => {
      try {
        if (file.files[0].size > 100000) {
          throw new Error('CSV ใหญ่เกิน 100 KB');
        }

        selectedCsv = await file.files[0].text();
        const result = await api('/api/invitations/csv', {
          method: 'POST',
          body: JSON.stringify({ csv: selectedCsv }),
        });
        csvRows = result.rows;
        preview.replaceChildren();
        preview.append(
          element(
            'p',
            'notice',
            `ทั้งหมด ${csvRows.length} · ส่ง ${csvRows.filter((r) => !r.error && !r.skip).length} · ข้ามสมาชิกเดิม ${csvRows.filter((r) => r.skip).length} · ต้องแก้ ${csvRows.filter((r) => r.error).length}`,
          ),
        );

        for (const row of csvRows) {
          preview.append(
            element(
              'p',
              row.error ? 'error' : 'fine',
              `${row.row}: ${row.email} · ${labels[row.role] || row.role}${row.error ? ' · ' + row.error : row.info ? ' · ' + row.info : ''}`,
            ),
          );
        }

        confirm.disabled = !csvRows.length || csvRows.some((r) => r.error);
      } catch (error) {
        toast(error.message);
      }
    };

    confirm = button(
      'ยืนยันและส่งอีเมลคำเชิญ',
      async () => {
        if (
          csvRows.some((row) => row.existing) &&
          !window.confirm(
            'มีคำเชิญเดิมอยู่ ต้องการส่งอีกครั้งหรือไม่? จะคงสิทธิ์เดิม แต่ลิงก์ในอีเมลเดิมจะใช้ไม่ได้',
          )
        ) {
          return;
        }

        confirm.disabled = true;

        try {
          const result = await api('/api/invitations/csv', {
            method: 'POST',
            body: JSON.stringify({ csv: selectedCsv, confirm: true }),
          });
          toast(`สร้างคำเชิญ ${result.invitations.length} รายการแล้ว · เข้าคิวส่งอีเมล`);
          await listInvites();
        } finally {
          confirm.disabled = false;
        }
      },
      'primary',
    );
    confirm.disabled = true;
    body.append(confirm);
  }

  function calendarShare(body) {
    if (!state.group?.slug || !state.group.canRead) {
      return;
    }

    const calendarUrl = new URL(`/g/${encodeURIComponent(state.group.slug)}`, location.origin).href;
    const share = element('div', 'calendar-share-link');
    const link = element('input');
    link.type = 'url';
    link.value = calendarUrl;
    link.readOnly = true;
    link.setAttribute('aria-label', 'ลิงก์ดูปฏิทิน');
    share.append(
      link,
      button('คัดลอกลิงก์ปฏิทิน', async () => {
        try {
          await navigator.clipboard.writeText(calendarUrl);
        } catch {
          link.select();

          if (!document.execCommand('copy')) {
            toast('เลือกลิงก์ไว้แล้ว กดคัดลอกได้เลย');
            return;
          }
        }

        toast('คัดลอกลิงก์ปฏิทินแล้ว');
      }),
    );
    body.append(
      share,
      element(
        'p',
        'fine',
        'ลิงก์สำหรับดูปฏิทิน หากเลือกเฉพาะสมาชิก ผู้รับต้องเป็นสมาชิกและเข้าสู่ระบบ',
      ),
    );
  }

  async function settings() {
    const body = open('จัดการกลุ่ม');

    if (state.group.role === 'owner' || state.session.user?.platformAdmin) {
      const node = form(body, async (f) => {
        await api('/api/group', {
          method: 'PUT',
          body: JSON.stringify({
            name: f.elements.name.value,
            visibility: f.elements.visibility.value,
          }),
        });
        dialog.close();
        await reload();
        toast('บันทึกกลุ่มแล้ว');
      });
      field(node, 'ชื่อกลุ่ม', 'name', 'text', state.group.name);
      select(
        node,
        'การดูปฏิทิน',
        'visibility',
        [
          ['private', 'เฉพาะสมาชิก'],
          ['public', 'ดูได้ผ่านลิงก์โดยไม่ login'],
        ],
        state.group.visibility,
      );
      calendarShare(node);
      submit(node, 'บันทึกกลุ่ม');
      body.append(button('โอนเจ้าของกลุ่ม', transfer));

      if (state.group.role === 'owner') {
        body.append(
          button('สิทธิ์ผู้ช่วยและการส่งประกาศ', () =>
            manageCapabilities({ api, state, element, toast }),
          ),
        );
      }
    }

    body.append(
      button('กิจกรรมทั้งหมด', () => workspace.events()),
      button('ถังขยะกิจกรรม', () => workspace.events(true)),
      button('ส่งออกกิจกรรม', workspace.exportData),
      button('เชิญสมาชิก', invites),
      button('ช่องแจ้งเตือน Discord', bindings),
      button('เชื่อมบัญชี Google/Discord', accounts),
      button('ดูประวัติการจัดการ', audit),
    );

    if (state.group.role === 'owner') {
      const danger = element('section', 'group-danger-zone');
      danger.append(
        element('h3', '', 'ลบปฏิทิน'),
        element(
          'p',
          'fine',
          'ย้ายเข้าถังขยะ 30 วัน เจ้าของกู้คืนได้ ระหว่างนั้นสมาชิกจะเข้าไม่ได้และระบบกลุ่มจะหยุดแจ้งเตือน',
        ),
      );
      danger.append(button('ลบปฏิทินนี้', deleteGroup, 'danger'));
      body.append(danger);
    }
  }

  async function deleteGroup() {
    const group = { ...state.group };
    const body = open('ย้ายปฏิทินเข้าถังขยะ');
    body.append(
      element(
        'p',
        '',
        `ปฏิทิน “${group.name}” จะอยู่ในถังขยะ 30 วัน จากนั้นกิจกรรม สมาชิก และการตั้งค่าของกลุ่มนี้จะถูกลบถาวร วันทั่วไปและบัญชีผู้ใช้จะยังอยู่`,
      ),
    );
    body.append(
      element(
        'p',
        'fine',
        'คำเชิญเดิมจะถูกยกเลิก แม้กู้คืนแล้วก็ต้องเชิญใหม่ ข้อความหรืออีเมลที่ส่งไปแล้วไม่สามารถเรียกคืนได้',
      ),
    );
    const node = form(body, async (f) => {
      await api('/api/group', {
        method: 'DELETE',
        body: JSON.stringify({ name: f.elements.name.value }),
        groupId: group.id,
      });
      dialog.close();
      state.groupId = '';
      history.replaceState(null, '', '/');
      await reload();
      toast('ย้ายปฏิทินเข้าถังขยะแล้ว กู้คืนได้ภายใน 30 วัน');
    });
    const name = field(node, `พิมพ์ชื่อปฏิทินให้ตรง: ${group.name}`, 'name');
    name.required = true;
    name.autocomplete = 'off';
    submit(node, 'ยืนยันย้ายเข้าถังขยะ');
    const confirmButton = node.querySelector('[type=submit]');
    confirmButton.classList.add('danger');
    confirmButton.disabled = true;

    name.oninput = () => {
      confirmButton.disabled = name.value !== group.name;
    };
  }

  async function trash() {
    const body = open('ถังขยะปฏิทิน');
    body.append(
      element(
        'p',
        'fine',
        'เฉพาะเจ้าของที่เห็นและกู้คืนได้ภายใน 30 วัน กิจกรรมและสมาชิกจะกลับมา แต่คำเชิญเดิมไม่กลับมาใช้งาน',
      ),
    );
    const items = await api('/api/groups/trash');

    if (!items.length) {
      body.append(element('p', 'empty', 'ไม่มีปฏิทินในถังขยะ'));
    }

    for (const group of items) {
      const card = element('article', 'proposal');
      card.append(
        element('h3', '', group.name),
        element(
          'p',
          'fine',
          `กู้คืนได้ถึง ${new Date(group.purge_after).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
        ),
      );
      const restore = button(
        'กู้คืนปฏิทิน',
        async () => {
          restore.disabled = true;

          try {
            const result = await api(`/api/groups/${encodeURIComponent(group.id)}/restore`, {
              method: 'POST',
              body: '{}',
            });
            dialog.close();
            state.groupId = result.id;
            history.replaceState(null, '', `/g/${result.slug}`);
            await reload();
            toast('กู้คืนปฏิทินแล้ว');
          } finally {
            restore.disabled = false;
          }
        },
        'primary',
      );
      card.append(restore);
      body.append(card);
    }
  }

  async function transfer() {
    const body = open('โอนเจ้าของกลุ่ม');
    const members = await api('/api/members');
    const node = form(body, async (f) => {
      if (!confirm('ส่งคำขอโอนเจ้าของ? สิทธิ์จะเปลี่ยนเมื่อผู้รับยอมรับภายใน 7 วัน')) {
        return;
      }

      await api('/api/group/transfer', {
        method: 'POST',
        body: JSON.stringify({ userId: f.elements.userId.value }),
      });
      dialog.close();
      await reload();
    });
    select(
      node,
      'เจ้าของคนใหม่',
      'userId',
      members
        .filter((m) => !m.blocked && m.id !== state.session.user.id)
        .map((m) => [m.id, m.name]),
      '',
    );
    submit(node, 'ส่งคำขอโอนเจ้าของ');
    const pending = await api('/api/group/transfer');

    if (pending) {
      body.append(
        element(
          'p',
          'notice',
          `รอ ${pending.name} ยอมรับ · หมดอายุ ${new Date(pending.expires_at).toLocaleString('th-TH')}`,
        ),
        button('ยกเลิกคำขอ', async () => {
          await api('/api/group/transfer', { method: 'DELETE' });
          await transfer();
        }),
      );
    }
  }

  async function audit() {
    const body = open('ประวัติกลุ่ม');
    await renderGroupHistory({ api, state, element, root: body });
  }

  async function accounts() {
    const body = open('เชื่อมบัญชี');
    body.append(
      element('p', 'fine', 'ยืนยันบัญชีทั้งสองก่อนเชื่อม ระบบไม่รวมบัญชีจากอีเมลตรงกันอัตโนมัติ'),
    );
    const linked = await api('/api/accounts');

    for (const account of linked) {
      const card = element('article', 'proposal');
      card.append(
        element('h3', '', account.provider),
        element('p', 'fine', account.email || 'ไม่เปิดเผยอีเมล'),
      );

      if (linked.length > 1) {
        card.append(
          button('ยกเลิกการเชื่อม', async () => {
            if (
              !confirm(
                `ยกเลิก ${account.provider}? จะออกจากระบบเครื่องอื่น และต้องใช้บัญชีที่เหลือเข้าสู่ระบบ`,
              )
            ) {
              return;
            }

            await api(`/api/accounts/${account.provider}`, { method: 'DELETE' });
            await accounts();
          }),
        );
      }

      body.append(card);
    }

    body.append(
      button('อุปกรณ์ที่เข้าสู่ระบบ', workspace.sessions),
      button('คำขอโอนเจ้าของ', workspace.ownership),
    );

    for (const provider of ['google', 'discord']) {
      body.append(
        button(`เชื่อม ${provider}`, async () => {
          const data = await api(`/api/accounts/link/${provider}`, {
            method: 'POST',
            body: JSON.stringify({ returnTo: location.pathname + location.search }),
          });
          location.href = data.url;
        }),
      );
    }
  }

  async function bindings() {
    const body = open('แจ้งเตือน Discord ของกลุ่ม');
    body.append(
      element(
        'p',
        'fine',
        'เพิ่มการเชื่อมโดยใช้ /calendar connect ในช่อง Discord หรือให้ผู้ดูแลระบบเพิ่มผ่าน control panel',
      ),
    );

    for (const binding of await api('/api/discord-bindings')) {
      const node = form(body, async (f) => {
        const config = {
          ...binding.config,
          dailyTime: f.elements.dailyTime.value,
          beforeDay: f.elements.beforeDay.checked,
          timed: f.elements.timed.checked,
          leadMinutes: Number(f.elements.leadMinutes.value),
          color: f.elements.color.value,
          categories: [...f.querySelectorAll('[name=category]:checked')].map((i) => i.value),
        };
        await api(`/api/discord-bindings/${binding.id}`, {
          method: 'PUT',
          body: JSON.stringify({ enabled: f.elements.enabled.checked, config }),
        });
        toast('บันทึกการแจ้งเตือนแล้ว');
      });
      node.append(element('h3', '', `Discord ${binding.guild_id} · ช่อง ${binding.channel_id}`));
      field(node, 'สรุปประจำวัน', 'dailyTime', 'time', binding.config.dailyTime);
      field(node, 'สีข้อความ', 'color', 'color', binding.config.color);

      for (const [name, label, value] of [
        ['enabled', 'เปิดการส่ง', binding.enabled],
        ['beforeDay', 'เตือนล่วงหน้าหนึ่งวัน ตอนเที่ยง', binding.config.beforeDay],
        ['timed', 'เตือนกิจกรรมตามเวลาเพิ่มเติม', binding.config.timed],
      ]) {
        const row = element('label');
        const input = element('input');
        input.type = 'checkbox';
        input.name = name;
        input.checked = !!value;
        row.append(input, document.createTextNode(' ' + label));
        node.append(row);
      }

      select(
        node,
        'ก่อนกิจกรรม (นาที)',
        'leadMinutes',
        [0, 5, 15, 30, 60, 1440].map((n) => [String(n), String(n)]),
        String(binding.config.leadMinutes),
      );
      const catalog = await api('/api/catalog');

      for (const category of catalog.categories) {
        const row = element('label');
        const input = element('input');
        input.type = 'checkbox';
        input.name = 'category';
        input.value = category.id;
        input.checked = binding.config.categories.includes(category.id);
        row.append(input, document.createTextNode(' ' + category.label));
        node.append(row);
      }

      submit(node, 'บันทึก');
      node.append(
        button('ส่งข้อความทดลอง', async () => {
          await api(`/api/discord-bindings/${binding.id}/test`, { method: 'POST', body: '{}' });
          toast('เพิ่มงานทดลองแล้ว บอทที่ทำงานจะรับไปส่ง');
        }),
      );
    }
  }

  async function connect(token) {
    const body = open('เชื่อมช่อง Discord กับกลุ่ม');

    if (!state.session.user) {
      body.append(
        element('p', '', 'เข้าสู่ระบบด้วย Discord ของผู้ใช้คำสั่งก่อน'),
        button('เข้าสู่ระบบ', () => $('#login-dialog').showModal()),
      );
      return;
    }

    body.append(
      element(
        'p',
        '',
        `จะเชื่อมช่องที่เลือกใน Discord เข้ากับ ${state.group?.name || 'กลุ่มที่เลือก'}`,
      ),
      button('ยืนยันเชื่อมกลุ่ม', async () => {
        await api('/api/discord-connect', { method: 'POST', body: JSON.stringify({ token }) });
        history.replaceState(null, '', `/g/${state.group.slug}`);
        dialog.close();
        toast('เชื่อมช่องแจ้งเตือนแล้ว');
      }),
      button('เชื่อมบัญชี Discord', accounts),
    );
  }

  function chooseGroup() {
    const body = open('กลุ่มปฏิทิน');
    const list = element('div', 'group-picker-list');
    const groups = [...(state.groups || [])];

    if (state.group && !groups.some((group) => group.id === state.group.id)) {
      groups.push(state.group);
    }

    const search = element('input');
    search.type = 'search';
    search.placeholder = 'ค้นหากลุ่มของฉัน';
    search.setAttribute('aria-label', 'ค้นหากลุ่มของฉัน');
    body.append(element('p', 'group-menu-caption', 'เลือกปฏิทินที่ต้องการดู'), search, list);

    search.oninput = () => {
      for (const item of list.children) {
        item.hidden = !item.textContent.toLowerCase().includes(search.value.toLowerCase());
      }
    };

    for (const group of groups) {
      const selected = group.id === state.groupId;
      const choice = button(
        '',
        async () => {
          if (selected) {
            return dialog.close();
          }

          state.groupId = group.id;
          history.pushState(null, '', `/g/${group.slug}`);
          await reload();
          dialog.close();
        },
        `group-picker-item${selected ? ' is-current' : ''}`,
      );
      choice.setAttribute('aria-pressed', String(selected));
      const info = element('span', 'group-picker-info');
      info.append(
        element('strong', '', group.name),
        element('small', '', labels[group.role] || 'ผู้ช่วยภายนอก'),
      );
      choice.append(
        element('span', 'group-picker-avatar', group.name.slice(0, 1)),
        info,
        element('span', 'group-picker-check', selected ? '✓' : ''),
      );
      list.append(choice);
    }

    if (!groups.length) {
      list.append(element('p', 'fine', 'ยังไม่มีกลุ่ม เลือกสร้างกลุ่มหรือเข้าร่วมด้วยคำเชิญ'));
    }

    calendarShare(body);
    const actions = element('div', 'group-menu-actions');
    actions.append(
      button('＋ สร้างกลุ่ม', create),
      button('↗ เข้าร่วมด้วยคำเชิญ', () => join()),
    );

    if (['owner', 'manager'].includes(state.group?.role)) {
      actions.append(button('⚙ จัดการกลุ่มนี้', settings));
    }

    body.append(actions);

    if (state.session.user) {
      const options = element('details', 'workspace-tools');
      options.append(element('summary', '', 'ตัวเลือกและบัญชี'));
      const secondary = element('div', 'workspace-actions');
      secondary.append(button('บัญชีของฉัน', accounts), button('ถังขยะปฏิทิน', trash));

      if (state.group?.role) {
        secondary.append(
          button('ปฏิทินที่แสดงร่วมกัน', workspace.views),
          button('ถังขยะกิจกรรม', () => workspace.events(true)),
          button('ออกจากกลุ่ม', workspace.leave),
        );
      }

      options.append(secondary);
      body.append(options);
    }
  }

  async function refreshed() {
    const root = $('#group-controls');
    root.replaceChildren();
    const trigger = button('', chooseGroup, 'group-menu-trigger');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', 'groups-dialog');
    trigger.setAttribute(
      'aria-label',
      `เลือกกลุ่มปฏิทิน · ${state.group?.name || 'ยังไม่มีปฏิทิน'}`,
    );
    const name = element('span', 'group-trigger-name', state.group?.name || 'ยังไม่มีปฏิทิน');
    name.id = 'group-name';
    trigger.append(element('span', 'group-trigger-icon', '▦'), name, chevron());
    root.append(trigger);
    $('#group-access').textContent = state.group?.trashed
      ? 'ปฏิทินอยู่ในถังขยะ เจ้าของกู้คืนได้จากเมนูกลุ่ม → ถังขยะปฏิทิน'
      : state.group?.canRead === false
        ? 'ต้องได้รับคำเชิญเพื่อเข้าถึงกลุ่มนี้'
        : state.group?.visibility === 'private'
          ? 'ปฏิทินเฉพาะสมาชิกกลุ่ม'
          : '';
    $('#group-access').hidden = !$('#group-access').textContent;
  }

  return { refreshed, join, connect, invites, eventTools: workspace.eventTools };
}
