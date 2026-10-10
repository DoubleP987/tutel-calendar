const labels = { owner: 'เจ้าของ', manager: 'ผู้จัดการ', editor: 'ผู้แก้ไข', member: 'สมาชิก' };

/** Group navigation and invitation workflows share the calendar's scoped API helper. */
export function groupsUI({ api, state, element, toast, reload }) {
  const $ = (selector) => document.querySelector(selector);
  const dialog = element('dialog');
  dialog.id = 'groups-dialog';
  document.body.append(dialog);
  let selectedCsv = '',
    csvRows = [];
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
    const row = element('label', '', label),
      input = element('input');
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
    if (!dialog.open) dialog.showModal();
    return body;
  }
  function form(body, submit) {
    const node = element('form', 'group-form');
    node.onsubmit = async (event) => {
      event.preventDefault();
      const send = node.querySelector('[type=submit]');
      if (send) send.disabled = true;
      try {
        await submit(node);
      } catch (error) {
        toast(error.message);
      } finally {
        if (send) send.disabled = false;
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
    const row = element('label', '', label),
      input = element('select');
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
        if (navigator.clipboard) await navigator.clipboard.writeText(value);
        else {
          box.select();
          document.execCommand('copy');
        }
        toast('คัดลอกแล้ว');
      }),
    );
  }

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
          maxUses: kind === 'email' ? 1 : Number(f.elements.maxUses.value),
        }),
      });
      body.replaceChildren();
      const sent = invitation.delivery.status === 'sent';
      const failed = kind === 'email' && !sent;
      const title =
        kind === 'email'
          ? sent
            ? 'ส่งคำเชิญแล้ว'
            : 'สร้างคำเชิญแล้ว แต่ส่งอีเมลไม่สำเร็จ'
          : kind === 'code'
            ? 'รหัสเข้าร่วมพร้อมแล้ว'
            : 'ลิงก์เชิญพร้อมแล้ว';
      body.append(element('h3', 'invite-result-title', title));
      if (kind === 'email')
        body.append(
          element(
            'p',
            'fine',
            sent
              ? `ส่งลิงก์เข้าร่วมไปที่ ${invitation.email} แล้ว ผู้รับเข้าสู่ระบบด้วยอีเมลนี้เพื่อเข้ากลุ่ม`
              : 'ยังไม่ได้ส่งถึงผู้รับ คุณสามารถคัดลอกลิงก์ด้านล่างไปให้ผู้รับโดยตรงได้',
          ),
        );
      else
        body.append(
          element(
            'p',
            'fine',
            kind === 'code'
              ? 'ส่งรหัสนี้ให้ผู้รับ แล้วให้เลือกเข้าร่วมด้วยคำเชิญ'
              : 'คัดลอกลิงก์นี้ส่งให้คนที่ต้องการเชิญ ผู้รับต้องเข้าสู่ระบบก่อนเข้าร่วม',
          ),
        );
      if (!sent) showSecret(body, kind === 'code' ? invitation.token : invitation.url);
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
      uses.parentElement.hidden = kind === 'email';
      node.querySelector('[type=submit]').textContent =
        kind === 'email' ? 'ส่งคำเชิญ' : kind === 'code' ? 'สร้างรหัสเข้าร่วม' : 'สร้างลิงก์เชิญ';
      hint.textContent =
        kind === 'email'
          ? 'ส่งลิงก์ให้ผู้รับทันที ใช้ได้เฉพาะ Google หรือ Discord ที่ยืนยันอีเมลตรงกับผู้รับ'
          : kind === 'code'
            ? 'สร้างรหัสสำหรับส่งให้สมาชิก ใช้รหัสเพื่อเข้าร่วมกลุ่ม'
            : 'สร้างลิงก์สำหรับคัดลอกส่งในแชท ผู้ที่มีลิงก์สามารถเข้าสู่ระบบเพื่อเข้าร่วมได้';
    };
    node.elements.kind.onchange = updateMethod;
    updateMethod();
    const tools = element('div', 'invite-footer');
    tools.append(button('ดูคำเชิญทั้งหมด', listInvites), button('นำเข้ารายชื่อ CSV', csv));
    body.append(tools);
  }
  async function listInvites() {
    const body = open('คำเชิญของกลุ่ม'),
      items = await api('/api/invitations');
    body.append(button('＋ เชิญสมาชิก', invites));
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
      if (!ended)
        card.append(
          button('ยกเลิกคำเชิญ', async () => {
            await api(`/api/invitations/${invite.id}`, { method: 'DELETE' });
            await listInvites();
          }),
        );
      body.append(card);
    }
    if (!items.length) body.append(element('p', 'empty', 'ยังไม่มีคำเชิญ'));
  }
  async function csv() {
    const body = open('นำเข้ารายชื่อ CSV');
    body.append(
      element(
        'p',
        'fine',
        'เพิ่มสิทธิ์ไว้ให้รายชื่อนี้ เมื่อเข้าสู่ระบบด้วยอีเมลตรงกันจะเข้ากลุ่มได้ โดยไม่ส่งเมลจำนวนมาก · หัวตาราง email,name,role · role เป็น member หรือ editor · สูงสุด 500 คน',
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
        if (file.files[0].size > 100000) throw new Error('CSV ใหญ่เกิน 100 KB');
        selectedCsv = await file.files[0].text();
        const result = await api('/api/invitations/csv', {
          method: 'POST',
          body: JSON.stringify({ csv: selectedCsv }),
        });
        csvRows = result.rows;
        preview.replaceChildren();
        for (const row of csvRows)
          preview.append(
            element(
              'p',
              row.error ? 'error' : 'fine',
              `${row.row}: ${row.email} · ${labels[row.role] || row.role}${row.error ? ' · ' + row.error : ''}`,
            ),
          );
        confirm.disabled = !csvRows.length || csvRows.some((r) => r.error);
      } catch (error) {
        toast(error.message);
      }
    };
    confirm = button(
      'ยืนยันสร้างคำเชิญ',
      async () => {
        const result = await api('/api/invitations/csv', {
          method: 'POST',
          body: JSON.stringify({ csv: selectedCsv, confirm: true }),
        });
        toast(`สร้างคำเชิญ ${result.invitations.length} รายการแล้ว · จะจับคู่เมื่อผู้รับ login`);
        dialog.close();
      },
      'primary',
    );
    confirm.disabled = true;
    body.append(confirm);
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
      submit(node, 'บันทึกกลุ่ม');
      body.append(button('โอนเจ้าของกลุ่ม', transfer));
    }
    body.append(
      button('เชิญสมาชิก', invites),
      button('ช่องแจ้งเตือน Discord', bindings),
      button('เชื่อมบัญชี Google/Discord', accounts),
      button('ดูประวัติการจัดการ', audit),
    );
  }
  async function transfer() {
    const body = open('โอนเจ้าของกลุ่ม'),
      members = await api('/api/members'),
      node = form(body, async (f) => {
        if (!confirm('โอนเจ้าของกลุ่มให้สมาชิกที่เลือก?')) return;
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
    submit(node, 'โอนเจ้าของ');
  }
  async function audit() {
    const body = open('ประวัติกลุ่ม');
    for (const item of await api('/api/group/audit'))
      body.append(
        element(
          'p',
          'fine',
          `${new Date(item.created_at).toLocaleString('th-TH')} · ${item.actor} · ${item.action}`,
        ),
      );
  }
  async function accounts() {
    const body = open('เชื่อมบัญชี');
    body.append(
      element('p', 'fine', 'ยืนยันบัญชีทั้งสองก่อนเชื่อม ระบบไม่รวมบัญชีจากอีเมลตรงกันอัตโนมัติ'),
    );
    for (const provider of ['google', 'discord'])
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
        const row = element('label'),
          input = element('input');
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
        const row = element('label'),
          input = element('input');
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
    if (state.group && !groups.some((group) => group.id === state.group.id))
      groups.push(state.group);
    body.append(element('p', 'group-menu-caption', 'เลือกปฏิทินที่ต้องการดู'), list);
    for (const group of groups) {
      const selected = group.id === state.groupId;
      const choice = button(
        '',
        async () => {
          if (selected) return dialog.close();
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
        element(
          'small',
          '',
          labels[group.role] || (group.visibility === 'public' ? 'ปฏิทินสาธารณะ' : 'สมาชิก'),
        ),
      );
      choice.append(
        element('span', 'group-picker-avatar', group.name.slice(0, 1)),
        info,
        element('span', 'group-picker-check', selected ? '✓' : ''),
      );
      list.append(choice);
    }
    if (!groups.length)
      list.append(element('p', 'fine', 'ยังไม่มีกลุ่ม เลือกสร้างกลุ่มหรือเข้าร่วมด้วยคำเชิญ'));
    const actions = element('div', 'group-menu-actions');
    actions.append(
      button('＋ สร้างกลุ่ม', create),
      button('↗ เข้าร่วมด้วยคำเชิญ', () => join()),
    );
    if (state.session.user) actions.append(button('เชื่อมบัญชี Google / Discord', accounts));
    if (['owner', 'manager'].includes(state.group?.role))
      actions.append(button('⚙ จัดการกลุ่มนี้', settings), button('เชิญสมาชิก', invites));
    body.append(actions);
  }

  async function refreshed() {
    const root = $('#group-controls');
    root.replaceChildren();
    const trigger = button('', chooseGroup, 'group-menu-trigger');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', 'groups-dialog');
    trigger.setAttribute('aria-label', `เลือกกลุ่มปฏิทิน · ${state.group?.name || 'เลือกกลุ่ม'}`);
    const name = element('span', 'group-trigger-name', state.group?.name || 'เลือกกลุ่ม');
    name.id = 'group-name';
    trigger.append(element('span', 'group-trigger-icon', '▦'), name, chevron());
    root.append(trigger);
    $('#group-access').textContent =
      state.group?.canRead === false
        ? 'ต้องได้รับคำเชิญเพื่อเข้าถึงกลุ่มนี้'
        : state.group?.visibility === 'private'
          ? 'ปฏิทินเฉพาะสมาชิกกลุ่ม'
          : '';
    $('#group-access').hidden = !$('#group-access').textContent;
  }
  return { refreshed, join, connect, invites };
}
