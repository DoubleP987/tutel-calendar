/** Secondary workflows live in dialogs, keeping the calendar surface uncluttered. */
export function workspaceUI({ api, state, element, toast, reload, open, button, editEvent }) {
  const labels = {
    active: 'ใช้งาน',
    draft: 'ฉบับร่าง',
    cancelled: 'ยกเลิก',
    trash: 'ถังขยะ',
    pending: 'รออนุมัติ',
    published: 'เผยแพร่',
    rejected: 'ไม่อนุมัติ',
  };

  function note(body, text) {
    body.append(element('p', 'fine', text));
  }

  async function leave() {
    const body = open('ออกจากกลุ่ม');
    note(
      body,
      `ออกจาก “${state.group.name}”? คุณจะหยุดเห็นกิจกรรมและรับแจ้งเตือนของกลุ่ม กิจกรรมที่คุณสร้างยังอยู่ ไม่สามารถกลับเข้าด้วยคำเชิญอีเมลอัตโนมัติ ต้องกดรับคำเชิญเอง`,
    );

    if (state.group.role === 'owner') {
      return note(
        body,
        'คุณเป็นเจ้าของ ต้องโอนเจ้าของให้คนอื่นยอมรับก่อน หรือย้ายปฏิทินเข้าถังขยะ',
      );
    }

    body.append(
      button(
        'ยืนยันออกจากกลุ่ม',
        async () => {
          await api('/api/group/leave', { method: 'POST', body: '{}' });
          document.getElementById('groups-dialog').close();
          state.groupId = '';
          history.replaceState(null, '', '/');
          await reload();
          toast('ออกจากกลุ่มแล้ว');
        },
        'danger',
      ),
    );
  }

  async function ownership() {
    const body = open('คำขอโอนเจ้าของ');
    const requests = await api('/api/ownership-requests');

    if (!requests.length) {
      note(body, 'ไม่มีคำขอที่รอคุณตอบรับ');
    }

    for (const request of requests) {
      const card = element('article', 'proposal');
      card.append(element('h3', '', request.name));
      note(
        card,
        `${request.from_name} ขอให้คุณเป็นเจ้าของปฏิทิน คุณจะจัดการสมาชิก การตั้งค่า และลบกลุ่มได้ ผู้ส่งจะเป็นผู้จัดการ · หมดอายุ ${new Date(request.expires_at).toLocaleString('th-TH')}`,
      );

      for (const [accept, label] of [
        [true, 'ยอมรับเป็นเจ้าของ'],
        [false, 'ปฏิเสธ'],
      ]) {
        card.append(
          button(
            label,
            async () => {
              if (accept && !confirm('ยอมรับหน้าที่เจ้าของปฏิทินนี้?')) {
                return;
              }

              await api(`/api/ownership-requests/${request.group_id}/respond`, {
                method: 'POST',
                body: JSON.stringify({ accept }),
              });
              await reload();
              await ownership();
            },
            accept ? 'primary' : '',
          ),
        );
      }

      body.append(card);
    }
  }

  async function views() {
    const body = open('ปฏิทินที่แสดงร่วมกัน');
    note(
      body,
      'เริ่มต้นแสดงเฉพาะกลุ่มที่เลือก คุณเลือกกลุ่มอื่นให้แสดงร่วมได้ วันทั่วไปแสดงครั้งเดียว และการเพิ่มกิจกรรมยังลงในกลุ่มที่กำลังเลือก',
    );
    const saved = await api('/api/account/view');
    const list = element('div', 'workspace-checks');
    const inputs = [];

    for (const group of state.groups.filter((g) => !g.suspended)) {
      const row = element('label');
      const input = element('input');
      input.type = 'checkbox';
      input.value = group.id;
      input.checked = group.id === state.groupId || saved.groupIds.includes(group.id);
      input.disabled = group.id === state.groupId;
      inputs.push(input);
      row.append(input, document.createTextNode(' ' + group.name));
      list.append(row);
    }

    body.append(
      list,
      button(
        'บันทึกการแสดง',
        async () => {
          await api('/api/account/view', {
            method: 'PUT',
            body: JSON.stringify({
              groupIds: inputs.filter((i) => i.checked && !i.disabled).map((i) => i.value),
            }),
          });
          document.getElementById('groups-dialog').close();
          await reload();
          toast('บันทึกปฏิทินที่แสดงแล้ว');
        },
        'primary',
      ),
      button('เฉพาะกลุ่มปัจจุบัน', async () => {
        await api('/api/account/view', { method: 'PUT', body: JSON.stringify({ groupIds: [] }) });
        document.getElementById('groups-dialog').close();
        await reload();
      }),
    );
  }

  async function eventHistory(event) {
    const body = open('ประวัติกิจกรรม');
    const entries = await api(`/api/events/${event.series_id || event.id}/history`, {
      groupId: event.group_id,
    });
    const names = {
      'event.created': 'สร้างกิจกรรม',
      'event.updated': 'แก้ไขกิจกรรม',
      'event.reviewed': 'ตรวจอนุมัติ',
      'event.trash': 'ย้ายเข้าถังขยะ',
      'event.deleted': 'ย้ายเข้าถังขยะ',
      'event.restore': 'กู้คืน',
      'event.cancel': 'ยกเลิกกิจกรรม',
      'event.cancelOccurrence': 'ยกเลิกครั้งนี้',
      'event.submit': 'ส่งฉบับร่าง',
    };

    if (!entries.length) {
      note(body, 'ไม่มีประวัติ');
    }

    for (const item of entries) {
      note(
        body,
        `${new Date(item.created_at).toLocaleString('th-TH')} · ${item.actor_name || 'ระบบ/บัญชีเดิม'} · ${names[item.action] || item.action}`,
      );
    }
  }

  async function action(event, action, date) {
    if (
      !confirm(
        action === 'restore'
          ? 'กู้คืนกิจกรรมนี้?'
          : action === 'submit'
            ? 'ส่งกิจกรรมนี้เพื่อเผยแพร่หรือตรวจอนุมัติ?'
            : 'ยืนยันการยกเลิกหรือย้ายกิจกรรมเข้าถังขยะ?',
      )
    ) {
      return;
    }

    await api(`/api/events/${event.series_id || event.id}/action`, {
      method: 'POST',
      groupId: event.group_id,
      body: JSON.stringify({ action, date }),
    });
    document.getElementById('detail-dialog').close();
    await reload();
    toast('บันทึกกิจกรรมแล้ว');
  }

  function eventTools(root, event, { management = false } = {}) {
    if (!state.session.user || event.data_scope !== 'group') {
      return;
    }

    const role =
      state.groups.find((g) => g.id === event.group_id)?.role ||
      (state.groupId === event.group_id ? state.group?.role : null);

    if (!role) {
      return;
    }

    const tools = element('details', 'workspace-tools');
    tools.append(element('summary', '', 'จัดการและประวัติ'));
    const controls = element('div', 'workspace-actions');
    controls.append(button('ประวัติ', () => eventHistory(event)));
    const writable =
      !event.source_id &&
      (['owner', 'manager', 'editor'].includes(role) ||
        event.owner_id === state.session.user.id ||
        management);

    if (writable && event.lifecycle !== 'trash') {
      if (event.series_id && event.group_id === state.groupId) {
        controls.append(
          button('แก้เฉพาะครั้งนี้', () => {
            document.getElementById('detail-dialog').close();
            editEvent(event, true);
          }),
        );
      }

      if (['draft', 'cancelled'].includes(event.lifecycle)) {
        controls.append(
          button(event.lifecycle === 'cancelled' ? 'ส่งกิจกรรมอีกครั้ง' : 'ส่งฉบับร่าง', () =>
            action(event, 'submit'),
          ),
        );
      }

      if (event.lifecycle === 'active' && event.status === 'published') {
        controls.append(
          button(event.series_id ? 'ยกเลิกทั้งชุด' : 'ยกเลิกกิจกรรม', () =>
            action(event, 'cancel'),
          ),
        );

        if (event.series_id) {
          controls.append(
            button('ยกเลิกเฉพาะครั้งนี้', () =>
              action(event, 'cancelOccurrence', event.occurrence_date || event.date),
            ),
          );
        }
      }

      if (!event.can_delete) {
        controls.append(button('ย้ายเข้าถังขยะ', () => action(event, 'trash'), 'danger'));
      }
    } else if (
      event.lifecycle === 'trash' &&
      (event.owner_id === state.session.user.id || ['owner', 'manager'].includes(role))
    ) {
      controls.append(button('กู้คืนกิจกรรม', () => action(event, 'restore'), 'primary'));
    }

    tools.append(controls);
    root.append(tools);
  }

  async function events(trash = false) {
    const body = open(trash ? 'ถังขยะกิจกรรม' : 'กิจกรรมทั้งหมดของกลุ่ม');
    note(
      body,
      trash
        ? 'กู้คืนได้ภายใน 30 วันหลังลบ กิจกรรมทั่วไปจากแหล่งข้อมูลกลางไม่อยู่ในถังขยะนี้'
        : 'จัดการกิจกรรมเฉพาะกลุ่มจากที่เดียว กิจกรรมที่นำเข้าต้องแก้ที่ต้นทาง',
    );
    const list = await api(trash ? '/api/events/trash' : '/api/group/events');
    const search = element('input');
    search.type = 'search';
    search.placeholder = 'ค้นหากิจกรรม';
    search.setAttribute('aria-label', 'ค้นหากิจกรรม');
    const cards = element('div', 'cards');
    body.append(search, cards);

    function render() {
      cards.replaceChildren();
      const filtered = list.filter((e) =>
        e.title.toLowerCase().includes(search.value.toLowerCase()),
      );

      if (!filtered.length) {
        note(cards, 'ไม่พบกิจกรรม');
      }

      for (const event of filtered) {
        const card = element('article', 'proposal');
        card.append(element('h3', '', event.title));
        note(
          card,
          `${event.date} · ${labels[event.lifecycle] || event.lifecycle} · ${labels[event.status]}${event.owner_name ? ' · ' + event.owner_name : ''}`,
        );

        if (!trash && !event.source_id) {
          card.append(
            button('แก้ไข', () => {
              document.getElementById('groups-dialog').close();
              editEvent(event);
            }),
          );
        }

        eventTools(card, event, { management: !trash });
        cards.append(card);
      }
    }

    search.oninput = render;
    render();
  }

  async function exportData() {
    const data = await api('/api/group/export');
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `calendar-${state.group.slug}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('ส่งออกกิจกรรมเฉพาะกลุ่มแล้ว ไม่มีข้อมูลบัญชีหรือ secret');
  }

  async function sessions() {
    const body = open('อุปกรณ์ที่เข้าสู่ระบบ');
    note(
      body,
      'รายการมาจาก session ที่ยังไม่หมดอายุ ชื่ออุปกรณ์เป็นชนิดโดยประมาณ ไม่ใช่ตำแหน่งที่ตั้ง',
    );
    const items = await api('/api/account/sessions');

    for (const item of items) {
      const card = element('article', 'proposal');
      card.append(element('h3', '', `${item.device}${item.current ? ' · เครื่องนี้' : ''}`));
      note(card, `หมดอายุ ${new Date(item.expires_at).toLocaleString('th-TH')}`);

      if (!item.current) {
        card.append(
          button('ออกจากระบบเครื่องนี้', async () => {
            await api(`/api/account/sessions/${item.id}`, { method: 'DELETE' });
            await sessions();
          }),
        );
      }

      body.append(card);
    }

    body.append(
      button('ออกจากระบบเครื่องอื่นทั้งหมด', async () => {
        if (!confirm('ออกจากระบบทุกเครื่อง ยกเว้นเครื่องที่คุณกำลังใช้?')) {
          return;
        }

        await api('/api/account/logout-others', { method: 'POST', body: '{}' });
        await sessions();
      }),
    );
  }

  return { leave, ownership, views, eventTools, events, exportData, sessions };
}
