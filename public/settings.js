import { renderGroupHistory, groupDate } from './history.js?v=20261010-history';

export function settingsUI({ api, state, element, toast, detail }) {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let registration,
    prefs,
    catalog,
    generation = 0;
  const pages = ['members', 'history', 'admin', 'notifications', 'preferences'];
  const preferenceForm = $('#preferences-form');
  const extraSettings = element('details', 'workspace-tools');
  extraSettings.append(element('summary', '', 'สรุปรายวันและช่วงเวลางดรบกวน'));
  for (const [name, text] of [
    ['notifyChanges', 'แจ้งเมื่อกิจกรรมเปลี่ยนหรือถูกยกเลิก'],
    ['notifyDaily', 'สรุปกิจกรรมวันนี้หนึ่งครั้ง ตามเวลาเตือนทั้งวัน'],
    ['quietEnabled', 'งดส่งแจ้งเตือนเข้าอุปกรณ์ในช่วงนี้ (ยังเก็บในเว็บ)'],
  ]) {
    const row = element('label'),
      input = element('input');
    input.type = 'checkbox';
    input.name = name;
    row.append(input, document.createTextNode(' ' + text));
    extraSettings.append(row);
  }
  for (const [name, text] of [
    ['quietStart', 'เริ่มงดรบกวน'],
    ['quietEnd', 'สิ้นสุดงดรบกวน'],
  ]) {
    const row = element('label', '', text),
      input = element('input');
    input.type = 'time';
    input.name = name;
    row.append(input);
    extraSettings.append(row);
  }
  preferenceForm.insertBefore(extraSettings, preferenceForm.querySelector('[type=submit]'));
  function categoryOptions(root, selected) {
    root.replaceChildren();
    for (const category of catalog.categories) {
      const label = element('label'),
        input = element('input');
      input.type = 'checkbox';
      input.value = category.id;
      input.checked = selected.includes(category.id);
      label.append(input, document.createTextNode(' ' + category.label));
      root.append(label);
    }
  }
  async function badge() {
    const epoch = generation;
    if (!state.session.user || !state.group?.role) {
      $('#unread-badge').hidden = true;
      if (navigator.clearAppBadge) await navigator.clearAppBadge().catch(() => {});
      return;
    }
    const data = await api('/api/notifications');
    if (epoch !== generation) return;
    $('#unread-badge').hidden = data.unread === 0;
    $('#unread-badge').textContent = data.unread > 99 ? '99+' : data.unread;
    if (navigator.setAppBadge && data.unread)
      await navigator.setAppBadge(data.unread).catch(() => {});
    else if (navigator.clearAppBadge) await navigator.clearAppBadge().catch(() => {});
  }
  async function refreshed(value, preferences) {
    generation++;
    catalog = value;
    prefs = preferences;
    $('#admin-nav').hidden = state.session.user?.role !== 'manager';
    for (const id of ['members-nav', 'history-nav'])
      document.getElementById(id).hidden = !state.session.user || !state.group?.role;
    await badge();
  }
  async function open(name) {
    if (!pages.includes(name)) return false;
    if (name === 'history') {
      await renderGroupHistory({ api, state, element, root: $('#history-list') });
      return true;
    }
    if (name === 'members') {
      const groupId = state.groupId;
      const members = await api('/api/members');
      if (state.groupId !== groupId) return true;
      const root = $('#members-list');
      root.replaceChildren();
      for (const user of members) {
        const card = element('article', 'proposal'),
          top = element('div', 'proposal-top');
        top.append(
          element('h3', '', user.name),
          element(
            'span',
            'status',
            user.blocked
              ? 'ระงับแล้ว'
              : {
                  owner: 'เจ้าของ',
                  manager: 'ผู้จัดการปฏิทิน',
                  editor: 'ผู้แก้ไข',
                  member: 'สมาชิก',
                }[user.role] || 'สมาชิก',
          ),
        );
        card.append(top);
        card.append(element('p', 'fine', `บัญชี ${user.provider}`));
        card.append(element('p', 'fine', `เข้าร่วม ${groupDate(user.joined_at)} · เวลาไทย`));
        if (!['owner', 'manager'].includes(state.group.role) && !state.session.user.platformAdmin) {
          root.append(card);
          continue;
        }
        const controls = element('div', 'member-controls'),
          role = element('select');
        for (const [value, title] of [
          ...(user.role === 'owner' ? [['owner', 'เจ้าของ']] : []),
          ['member', 'สมาชิก'],
          ['editor', 'ผู้แก้ไข'],
          ['manager', 'ผู้จัดการปฏิทิน'],
        ]) {
          const option = element('option', '', title);
          option.value = value;
          role.append(option);
        }
        role.value = user.role;
        role.setAttribute('aria-label', 'สิทธิ์ของ ' + user.name);
        const trusted = element('input'),
          blocked = element('input');
        trusted.type = blocked.type = 'checkbox';
        trusted.checked = !!user.auto_approve;
        blocked.checked = !!user.blocked;
        const trustLabel = element('label'),
          blockedLabel = element('label');
        trustLabel.append(trusted, document.createTextNode(' อนุมัติอัตโนมัติได้'));
        blockedLabel.append(blocked, document.createTextNode(' ระงับบัญชี'));
        const button = element('button', '', 'บันทึก');
        if (
          user.role === 'owner' ||
          user.id === state.session.user.id ||
          (state.group.role !== 'owner' && user.role === 'manager')
        ) {
          role.disabled = blocked.disabled = true;
        }
        button.onclick = async () => {
          if (
            (role.value !== user.role || blocked.checked !== !!user.blocked) &&
            !confirm(
              `เปลี่ยนสิทธิ์ของ ${user.name}? สมาชิกเพิ่มกิจกรรมของตัวเอง ผู้แก้ไขจัดการกิจกรรม ผู้จัดการดูแลสมาชิกและอนุมัติ แต่ไม่เป็นเจ้าของ`,
            )
          )
            return;
          button.disabled = true;
          try {
            await api('/api/members/' + user.id, {
              method: 'PUT',
              body: JSON.stringify({
                role: role.value,
                autoApprove: trusted.checked,
                blocked: blocked.checked,
              }),
            });
            toast('บันทึกสิทธิ์ปฏิทินแล้ว');
            await open('members');
          } catch (e) {
            toast(e.message);
            button.disabled = false;
          }
        };
        controls.append(role, trustLabel, blockedLabel, button);
        if (
          user.role !== 'owner' &&
          user.id !== state.session.user.id &&
          (state.group.role === 'owner' || user.role !== 'manager')
        ) {
          const remove = element('button', 'danger', 'นำออกจากกลุ่ม');
          remove.onclick = async () => {
            if (
              !confirm(
                `นำ ${user.name} ออกจากกลุ่ม? กิจกรรมเดิมยังอยู่ หากต้องการห้ามกลับเข้ากลุ่มให้ใช้ระงับแทน`,
              )
            )
              return;
            remove.disabled = true;
            try {
              await api('/api/members/' + user.id, { method: 'DELETE' });
              await open('members');
              toast('นำสมาชิกออกแล้ว');
            } catch (error) {
              toast(error.message);
              remove.disabled = false;
            }
          };
          controls.append(remove);
        }
        card.append(controls);
        root.append(card);
      }
    } else if (name === 'admin') {
      const config = await api('/api/admin-settings'),
        form = $('#admin-form');
      form.elements.approval.value = config.approval;
      for (const key of ['adminNotifyPending', 'adminNotifyPublished'])
        form.elements[key].checked = config[key];
    } else if (name === 'preferences') {
      prefs = await api('/api/preferences');
      const form = $('#preferences-form');
      for (const key of ['notifyPublished', 'notifyReview', 'notifyReminders'])
        form.elements[key].checked = prefs[key];
      for (const key of ['notifyChanges', 'notifyDaily', 'quietEnabled'])
        form.elements[key].checked = key === 'notifyChanges' ? prefs[key] !== false : !!prefs[key];
      form.elements.quietStart.value = prefs.quietStart || '22:00';
      form.elements.quietEnd.value = prefs.quietEnd || '07:00';
      form.elements.leadMinutes.value = prefs.leadMinutes;
      form.elements.dayTime.value = prefs.dayTime;
      categoryOptions($('#notify-categories'), prefs.notifyCategories);
      const supported =
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      $('#enable-push').disabled = !supported;
      $('#push-description').textContent = supported
        ? 'อนุญาตแจ้งเตือนครั้งเดียวเพื่อรับผ่านระบบแจ้งเตือนของอุปกรณ์ แม้ไม่ได้เปิดหน้าเว็บค้างไว้'
        : 'เบราว์เซอร์นี้ยังไม่รองรับ Web Push ลองเปิดผ่านแอปที่เพิ่มในหน้าจอโฮมและใช้ HTTPS';
    } else if (name === 'notifications') {
      const data = await api('/api/notifications'),
        root = $('#notification-list');
      root.replaceChildren();
      for (const n of data.items) {
        const card = element('article', n.read_at ? 'proposal' : 'proposal notification-unread');
        card.append(
          element('h3', '', n.title),
          element('p', '', n.body),
          element('small', 'muted', new Date(n.created_at).toLocaleString('th-TH')),
        );
        const event = state.events.find((e) => e.id === n.event_id);
        if (event) {
          const button = element('button', '', 'ดูกิจกรรม');
          button.onclick = () => detail(event);
          card.append(button);
        } else if (n.kind === 'review' && state.session.user.role === 'manager')
          card.append(element('p', 'fine', 'เปิดเมนูตรวจอนุมัติเพื่อดูข้อเสนอ'));
        root.append(card);
      }
      if (!data.items.length) root.append(element('div', 'empty', 'ยังไม่มีแจ้งเตือน'));
      await badge();
    }
    return true;
  }
  $('#admin-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target,
      button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
      await api('/api/admin-settings', {
        method: 'PUT',
        body: JSON.stringify({
          approval: form.elements.approval.value,
          adminNotifyPending: form.elements.adminNotifyPending.checked,
          adminNotifyPublished: form.elements.adminNotifyPublished.checked,
        }),
      });
      toast('บันทึกการตั้งค่าปฏิทินแล้ว');
    } catch (e) {
      toast(e.message);
    } finally {
      button.disabled = false;
    }
  };
  $('#preferences-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      prefs = await api('/api/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          notifyPublished: form.elements.notifyPublished.checked,
          notifyReview: form.elements.notifyReview.checked,
          notifyReminders: form.elements.notifyReminders.checked,
          notifyChanges: form.elements.notifyChanges.checked,
          notifyDaily: form.elements.notifyDaily.checked,
          quietEnabled: form.elements.quietEnabled.checked,
          quietStart: form.elements.quietStart.value,
          quietEnd: form.elements.quietEnd.value,
          leadMinutes: Number(form.elements.leadMinutes.value),
          dayTime: form.elements.dayTime.value,
          notifyCategories: $$('#notify-categories input:checked').map((i) => i.value),
        }),
      });
      toast('บันทึกการแจ้งเตือนของคุณแล้ว');
    } catch (e) {
      toast(e.message);
    }
  };
  $('#read-all').onclick = async () => {
    try {
      await api('/api/notifications/read', { method: 'POST', body: '{}' });
      await open('notifications');
    } catch (e) {
      toast(e.message);
    }
  };
  function bytes(value) {
    const str = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(str, (c) => c.charCodeAt(0));
  }
  async function worker() {
    registration ||= await navigator.serviceWorker.register('/sw.js');
    return navigator.serviceWorker.ready;
  }
  $('#enable-push').onclick = async () => {
    try {
      const config = await api('/api/push-key');
      if (!config.enabled) throw new Error('ยังไม่ได้ตั้งค่า Web Push บนเซิร์ฟเวอร์');
      // Permission requests must result from this explicit user click.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted')
        throw new Error('ยังไม่ได้อนุญาตแจ้งเตือน ให้เปลี่ยนในตั้งค่าเบราว์เซอร์');
      const ready = await worker();
      const subscription =
        (await ready.pushManager.getSubscription()) ||
        (await ready.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes(config.publicKey),
        }));
      await api('/api/push-subscriptions', { method: 'POST', body: JSON.stringify(subscription) });
      toast('เปิดแจ้งเตือนบนอุปกรณ์นี้แล้ว');
    } catch (e) {
      toast(e.message);
    }
  };
  async function disconnect() {
    if (!('serviceWorker' in navigator)) return;
    const ready = await navigator.serviceWorker.getRegistration();
    const subscription = await ready?.pushManager?.getSubscription();
    if (!subscription) return;
    await api('/api/push-subscriptions', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  }
  $('#disable-push').onclick = async () => {
    try {
      await disconnect();
      toast('ปิดแจ้งเตือนบนอุปกรณ์นี้แล้ว');
    } catch (e) {
      toast(e.message);
    }
  };
  $('#push-test').onclick = async () => {
    try {
      await api('/api/push-test', { method: 'POST', body: '{}' });
      await badge();
      toast('ส่งรายการทดลองแล้ว ตรวจกล่องแจ้งเตือนและอุปกรณ์');
    } catch (e) {
      toast(e.message);
    }
  };
  setInterval(() => {
    if (!document.hidden) void badge().catch(() => {});
  }, 15000);
  if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {});
  return { open, refreshed, disconnect };
}
