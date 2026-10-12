import { groupsUI } from './groups.js?v=20261012-invites-capabilities';
import { settingsUI } from './settings.js?v=20261012-invites-announcements';
import { setupInstallation } from './install.js?v=20261010-install';
import { setupFeedback } from './feedback.js?v=20261010-feedback-close';

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => [...document.querySelectorAll(selector)];
// Reuse the same controls and event handlers in desktop and mobile layouts.
const mobileNavigation = window.matchMedia('(max-width: 760px)');
const sidebar = $('#sidebar');
const sidebarToggle = $('#sidebar-toggle');
const accountActions = $('.account-actions');
const topbar = $('.topbar');

function closeSidebar(restoreFocus = true) {
  document.body.classList.remove('sidebar-open');
  $('#sidebar-backdrop').hidden = true;
  sidebarToggle.setAttribute('aria-expanded', 'false');
  $('main').inert = false;
  sidebar.inert = mobileNavigation.matches;

  if (restoreFocus && mobileNavigation.matches) {
    sidebarToggle.focus();
  }
}

function openSidebar() {
  if (!mobileNavigation.matches) {
    return;
  }

  document.body.classList.add('sidebar-open');
  sidebar.inert = false;
  $('main').inert = true;
  $('#sidebar-backdrop').hidden = false;
  sidebarToggle.setAttribute('aria-expanded', 'true');
  $('#sidebar-close').focus();
}

function updateNavigationLayout() {
  closeSidebar(false);

  if (mobileNavigation.matches) {
    sidebar.insertBefore(accountActions, $('.side-note'));
  } else {
    topbar.append(accountActions);
  }
}

sidebarToggle.onclick = openSidebar;

$('#sidebar-close').onclick = () => closeSidebar();

$('#sidebar-backdrop').onclick = () => closeSidebar();

sidebar.addEventListener('click', (event) => {
  if (event.target.closest('[data-page], [data-action], #login-open')) {
    closeSidebar(false);
  }
});

document.addEventListener('keydown', (event) => {
  if (!document.body.classList.contains('sidebar-open')) {
    return;
  }

  if (event.key === 'Escape') {
    closeSidebar();
  }

  if (event.key !== 'Tab') {
    return;
  }

  const controls = [...sidebar.querySelectorAll('button, a, input, select')].filter(
    (node) => !node.disabled && node.getClientRects().length,
  );
  const first = controls[0];
  const last = controls.at(-1);

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
});

mobileNavigation.addEventListener('change', updateNavigationLayout);
updateNavigationLayout();
setupInstallation({ closeSidebar, toast });
const state = {
  date: new Date(),
  selected: key(new Date()),
  view: 'month',
  page: 'calendar',
  events: [],
  session: {},
  groupId: decodeURIComponent(location.pathname.match(/^\/g\/([^/]+)/)?.[1] || ''),
  group: null,
  groups: [],
};
let categories = {};
let catalog;
setupFeedback({ state, toast, closeSidebar });
const statuses = { pending: 'รออนุมัติ', published: 'เผยแพร่แล้ว', rejected: 'ไม่อนุมัติ' };
const days = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

const thai = (date, options) => new Intl.DateTimeFormat('th-TH', options).format(date);

function key(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localDate(value) {
  return new Date(value + 'T12:00:00');
}

function element(tag, className, text) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

let toastTimer;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 4500);
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...((options.groupId ?? state.groupId)
      ? { 'x-calendar-group': options.groupId ?? state.groupId }
      : {}),
    ...(options.method ? { 'x-csrf-token': state.session.csrf || '' } : {}),
  };
  const { groupId, ...fetchOptions } = options;
  const response = await fetch(path, { ...fetchOptions, headers });
  const body = await response.json().catch(() => ({ error: 'โหลดไม่สำเร็จ กรุณาลองใหม่' }));

  if (!response.ok) {
    const error = new Error(body.error || 'โหลดไม่สำเร็จ');
    error.status = response.status;
    throw error;
  }

  return body;
}

const extended = settingsUI({ api, state, element, toast, detail });
const groupUI = groupsUI({ api, state, element, toast, reload, editEvent });
let saveTimer;
let preferenceEpoch = 0;

function guestPreferences(groupId = state.groupId) {
  try {
    return (
      JSON.parse(
        localStorage.getItem(`tutel-calendar-categories:${groupId || 'guest'}`) || 'null',
      ) || catalog.defaults.categories
    );
  } catch {
    return catalog.defaults.categories;
  }
}

function filters(selected) {
  const root = $('.filters');
  root.replaceChildren(element('h3', '', 'แสดงในปฏิทิน'));

  for (const c of catalog.categories) {
    const label = element('label');
    const input = element('input');
    input.type = 'checkbox';
    input.value = c.id;
    input.checked = selected.includes(c.id);
    label.append(input, document.createTextNode(' ' + c.label));

    input.onchange = () => {
      render();
      clearTimeout(saveTimer);
      const epoch = preferenceEpoch;
      const chosen = $$('.filters input:checked').map((i) => i.value);

      if (!state.session.user || !state.group?.role) {
        localStorage.setItem(
          `tutel-calendar-categories:${state.groupId || 'guest'}`,
          JSON.stringify(chosen),
        );
      } else {
        saveTimer = setTimeout(async () => {
          if (epoch !== preferenceEpoch) {
            return;
          }

          try {
            await api('/api/preferences', {
              method: 'PUT',
              body: JSON.stringify({ categories: chosen }),
            });
          } catch (e) {
            toast('บันทึกหมวดไม่สำเร็จ: ' + e.message);
          }
        }, 350);
      }
    };

    root.append(label);
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('tutel-calendar-theme', theme);
  $('#theme').title = theme === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด';
}

applyTheme(localStorage.getItem('tutel-calendar-theme') || 'light');

$('#theme').onclick = () =>
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

function visibleEvents() {
  const query = $('#search').value.trim().toLowerCase();
  const chosen = new Set($$('.filters input:checked').map((input) => input.value));
  return state.events.filter(
    (e) =>
      (chosen.has(e.category) ||
        JSON.parse(e.source_categories || '[]').some((c) => chosen.has(c))) &&
      `${e.title} ${e.description}`.toLowerCase().includes(query),
  );
}

function onDate(date) {
  return visibleEvents().filter((e) => e.date <= date && e.end_date >= date);
}

function detail(event) {
  const root = $('#detail-content');
  root.replaceChildren();
  root.append(
    element('h2', '', event.title),
    element(
      'p',
      '',
      `${thai(localDate(event.date), { dateStyle: 'full' })}${event.end_date !== event.date ? ' — ' + thai(localDate(event.end_date), { dateStyle: 'long' }) : ''}`,
    ),
    element('p', '', event.all_day ? 'ทั้งวัน' : `${event.time}–${event.end_time} · เวลาไทย`),
    element('p', '', categories[event.category]),
    element('p', 'detail-description', event.description || 'ไม่มีรายละเอียดเพิ่มเติม'),
  );

  if (event.owner_name) {
    root.append(element('p', 'fine', `เสนอโดย ${event.owner_name}`));
  }

  if (event.sample) {
    root.append(element('p', 'notice', 'ข้อมูลตัวอย่างสำหรับต้นแบบ'));
  }

  if (
    event.group_id === state.groupId &&
    !event.source_id &&
    (event.can_edit === true ||
      event.owner_id === state.session.user?.id ||
      ['owner', 'manager', 'editor'].includes(state.group?.role))
  ) {
    const edit = element('button', 'primary', event.series_id ? 'แก้ไขทั้งชุด' : 'แก้กิจกรรม');

    edit.onclick = () => editEvent(event);

    root.append(edit);
  }

  if (event.can_delete && event.group_id === state.groupId) {
    const remove = element('button', 'danger', 'ลบกิจกรรม');

    remove.onclick = async () => {
      if (!confirm(`ย้าย “${event.title}” ไปถังขยะ 30 วัน?`)) {
        return;
      }

      remove.disabled = true;

      try {
        await api(`/api/events/${encodeURIComponent(event.series_id || event.id)}`, {
          method: 'DELETE',
        });
        $('#detail-dialog').close();
        await reload();
        toast('ย้ายกิจกรรมเข้าถังขยะแล้ว');
      } catch (error) {
        toast(error.message);
      } finally {
        remove.disabled = false;
      }
    };

    root.append(remove);
  }

  if (event.group_name) {
    root.append(element('p', 'fine', `ปฏิทิน: ${event.group_name}`));
  }

  groupUI.eventTools(root, event);
  $('#detail-dialog').showModal();
}

function agendaItem(event) {
  const item = element('button', 'agenda-item');
  item.style.width = '100%';
  item.style.textAlign = 'left';
  item.style.borderRadius = '0';
  item.style.borderLeft = '0';
  item.style.borderRight = '0';
  item.style.borderBottom = '0';
  item.append(element('span', 'agenda-time', event.all_day ? 'ทั้งวัน' : event.time));
  const info = element('span');
  info.append(
    element('strong', '', event.title),
    element(
      'small',
      '',
      [categories[event.category], event.group_name].filter(Boolean).join(' · '),
    ),
  );
  item.append(info);

  item.onclick = () => detail(event);

  return item;
}

function render() {
  $('#selected-title').textContent =
    `รายการวันที่ ${thai(localDate(state.selected), { day: 'numeric', month: 'long' })}`;
  const agenda = $('#agenda');
  agenda.replaceChildren();
  const selected = onDate(state.selected);
  selected.forEach((event) => agenda.append(agendaItem(event)));

  if (!selected.length) {
    agenda.append(element('div', 'empty', 'ยังไม่มีกิจกรรมในวันนี้'));
  }

  $$('.segmented button').forEach((b) =>
    b.classList.toggle('selected', b.dataset.view === state.view),
  );
  const root = $('#calendar');
  root.replaceChildren();
  $('#range-title').textContent = thai(state.date, { month: 'long', year: 'numeric' });

  if (state.view === 'list') {
    const rows = visibleEvents().filter((e) => e.date.slice(0, 7) === key(state.date).slice(0, 7));
    let previous;

    for (const event of rows) {
      if (event.date !== previous) {
        root.append(
          element('div', 'list-date', thai(localDate(event.date), { dateStyle: 'full' })),
        );
        previous = event.date;
      }

      const wrapper = element('div', 'list-events');
      wrapper.append(agendaItem(event));
      root.append(wrapper);
    }

    if (!rows.length) {
      root.append(element('div', 'empty', 'ไม่มีกิจกรรมตามตัวกรองในเดือนนี้'));
    }

    return;
  }

  const grid = element('div', state.view === 'week' ? 'grid week' : 'grid');

  for (const day of days) {
    grid.append(element('div', 'weekday', day));
  }

  const start = new Date(
    state.date.getFullYear(),
    state.date.getMonth(),
    state.view === 'week' ? state.date.getDate() : 1,
  );
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const count = state.view === 'week' ? 7 : 42;

  if (state.view === 'week') {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    $('#range-title').textContent =
      `${thai(start, { day: 'numeric', month: 'short' })} – ${thai(end, { day: 'numeric', month: 'short' })}`;
  }

  for (let n = 0; n < count; n++) {
    const current = new Date(start);
    current.setDate(current.getDate() + n);
    const date = key(current);
    const cell = element('div', 'day');
    cell.classList.toggle('outside', current.getMonth() !== state.date.getMonth());
    cell.classList.toggle('selected', date === state.selected);
    const number = element('button', 'date-number', current.getDate());
    number.classList.toggle('today', date === key(new Date()));
    number.setAttribute('aria-label', `เพิ่มกิจกรรม ${thai(current, { dateStyle: 'full' })}`);

    number.onclick = (e) => {
      e.stopPropagation();
      state.selected = date;
      render();
      create(date);
    };

    cell.append(number);

    for (const event of onDate(date)) {
      const pill = element('button', 'event-pill');
      pill.append(element('span', '', `${event.all_day ? '' : event.time + ' '}${event.title}`));
      pill.style.setProperty('--event-color', event.color);
      const rgb = event.color
        .slice(1)
        .match(/../g)
        .map((x) => parseInt(x, 16));
      pill.style.setProperty(
        '--event-text',
        rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 150 ? '#14231a' : '#ffffff',
      );
      pill.classList.toggle('continues-before', event.date < date);
      pill.classList.toggle('continues-after', event.end_date > date);
      pill.title = [event.title, event.group_name].filter(Boolean).join(' · ');

      pill.onclick = (e) => {
        e.stopPropagation();
        detail(event);
      };

      cell.append(pill);
    }

    cell.onclick = () => {
      state.selected = date;
      render();
    };

    grid.append(cell);
  }

  root.append(grid);
}

function create(date = state.selected) {
  if (!state.session.user) {
    $('#login-dialog').showModal();
    return;
  }

  const form = $('#event-form');
  form.reset();
  form.elements.draft.disabled = false;
  form.elements.repeatUntil.value = date;
  form.elements.repeatUntil.disabled = true;
  delete form.dataset.editingId;
  delete form.dataset.occurrence;
  form.elements.repeatFrequency.disabled = false;
  form.elements.date.value = date;
  form.elements.endDate.value = date;
  $('#time-fields').hidden = true;
  $('#form-error').textContent = '';
  $('#event-dialog').showModal();
}

$$('[data-action=create]').forEach((b) => (b.onclick = () => create()));
$$('[data-close]').forEach(
  (b) => (b.onclick = () => document.getElementById(b.dataset.close).close()),
);

$('#event-form').elements.repeatFrequency.onchange = (e) => {
  $('#event-form').elements.repeatUntil.disabled = e.target.value === 'none';
};

$('#event-form').elements.allDay.onchange = (e) => ($('#time-fields').hidden = e.target.checked);

$('#event-form').elements.date.onchange = (e) => {
  if ($('#event-form').elements.endDate.value < e.target.value) {
    $('#event-form').elements.endDate.value = e.target.value;
  }
};

$('#event-form').onsubmit = async (e) => {
  e.preventDefault();
  const button = e.target.querySelector('[type=submit]');
  button.disabled = true;

  try {
    const payload = Object.fromEntries(new FormData(e.target));
    payload.allDay = e.target.elements.allDay.checked;
    payload.draft = e.target.elements.draft.checked;
    payload.recurrence = {
      frequency: e.target.elements.repeatFrequency.value,
      until: e.target.elements.repeatUntil.value,
    };
    const editingId = e.target.dataset.editingId;
    const occurrence = e.target.dataset.occurrence;
    const result = await api(
      occurrence
        ? '/api/events/' + editingId + '/action'
        : editingId
          ? '/api/events/' + editingId
          : '/api/events',
      {
        method: occurrence ? 'POST' : editingId ? 'PUT' : 'POST',
        body: JSON.stringify(
          occurrence ? { action: 'editOccurrence', date: occurrence, event: payload } : payload,
        ),
      },
    );
    $('#event-dialog').close();

    if (editingId) {
      toast('แก้กิจกรรมแล้ว');
    } else {
      toast(
        e.target.dataset.editingId
          ? false
          : result.status === 'published'
            ? 'เผยแพร่กิจกรรมอัตโนมัติแล้ว'
            : 'ส่งแล้ว · ติดตามผลได้ในกิจกรรมของฉัน',
      );
    }

    await reload();
    await page('mine');
  } catch (error) {
    $('#form-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

async function editEvent(event, single = false) {
  const occurrence = event.occurrence_date || event.date;

  if (event.series_id && !single) {
    try {
      event = await api(`/api/events/${event.series_id}`, { groupId: event.group_id });
    } catch (error) {
      toast(error.message);
      return;
    }
  }

  $('#detail-dialog').close();
  create(event.date);
  const form = $('#event-form');
  form.dataset.editingId = event.series_id || event.id;

  if (single) {
    form.dataset.occurrence = occurrence;
  }

  const recurrence = JSON.parse(event.recurrence || '{}');
  form.elements.repeatFrequency.value = recurrence.frequency || 'none';
  form.elements.repeatFrequency.disabled = single;
  form.elements.repeatUntil.value = recurrence.until || event.date;
  form.elements.repeatUntil.disabled = !recurrence.frequency;

  if (single) {
    form.elements.repeatUntil.disabled = true;
  }

  form.elements.draft.checked = event.lifecycle === 'draft';
  form.elements.draft.disabled = true;

  for (const [field, value] of Object.entries({
    title: event.title,
    description: event.description,
    date: event.date,
    endDate: event.end_date,
    time: event.time,
    endTime: event.end_time,
    color: event.color,
    category: event.category,
  })) {
    form.elements[field].value = value;
  }

  form.elements.allDay.checked = !!event.all_day;
  $('#time-fields').hidden = !!event.all_day;
}

function proposalCard(event, review) {
  const card = element('article', 'proposal');
  const top = element('div', 'proposal-top');
  top.append(
    element('h3', '', event.title),
    element(
      'span',
      `status ${event.status}`,
      event.lifecycle === 'draft'
        ? 'ฉบับร่าง'
        : event.lifecycle === 'cancelled'
          ? 'ยกเลิก'
          : statuses[event.status],
    ),
  );
  card.append(top);
  card.append(
    element(
      'p',
      '',
      `${thai(localDate(event.date), { dateStyle: 'long' })} · ${event.all_day ? 'ทั้งวัน' : event.time + '–' + event.end_time} · ${categories[event.category]}`,
    ),
  );

  if (event.owner_name) {
    card.append(element('small', '', `เสนอโดย ${event.owner_name}`));
  }

  card.append(element('p', '', event.description || 'ไม่มีรายละเอียดเพิ่มเติม'));

  if (event.review_note) {
    card.append(element('p', 'notice', `หมายเหตุจากผู้จัดการ: ${event.review_note}`));
  }

  if (
    !review &&
    !event.source_id &&
    (event.owner_id === state.session.user?.id ||
      event.status === 'pending' ||
      ['owner', 'manager', 'editor'].includes(state.group?.role))
  ) {
    const edit = element('button', '', 'แก้กิจกรรม');

    edit.onclick = () => editEvent(event);

    card.append(edit);
  }

  if (review) {
    const row = element('div', 'review-actions');

    for (const [status, label] of [
      ['published', '✓ อนุมัติและเผยแพร่'],
      ['rejected', 'ไม่อนุมัติ'],
    ]) {
      const button = element('button', status === 'published' ? 'primary' : '', label);

      button.onclick = async () => {
        const note =
          status === 'rejected' ? prompt('เหตุผลที่ไม่อนุมัติ (แจ้งให้เจ้าของกิจกรรมทราบ)') : '';

        if (note === null) {
          return;
        }

        button.disabled = true;

        try {
          await api('/api/review/' + event.id, {
            method: 'POST',
            body: JSON.stringify({ status, note }),
          });
          await reload();
          await page('review');
          toast(status === 'published' ? 'กิจกรรมเผยแพร่ในปฏิทินแล้ว' : 'บันทึกผลการตรวจแล้ว');
        } catch (error) {
          toast(error.message);
          button.disabled = false;
        }
      };

      row.append(button);
    }

    card.append(row);
  }

  if (!review) {
    groupUI.eventTools(card, event);
  }

  return card;
}

async function page(name) {
  if (name !== 'calendar' && !state.session.user) {
    $('#login-dialog').showModal();
    return;
  }

  if (['review', 'admin'].includes(name) && state.session.user?.role !== 'manager') {
    return;
  }

  if (['members', 'history'].includes(name) && !state.group?.role) {
    return;
  }

  state.page = name;

  for (const p of [
    'calendar',
    'mine',
    'review',
    'members',
    'history',
    'admin',
    'notifications',
    'preferences',
  ]) {
    document.getElementById(p + '-page').hidden = p !== name;
  }

  $$('[data-page]').forEach((b) => b.classList.toggle('active', b.dataset.page === name));
  $('#page-title').textContent = {
    calendar: 'ปฏิทิน',
    mine: 'กิจกรรมของฉัน',
    review: 'ตรวจอนุมัติ',
    members: 'สมาชิกและสิทธิ์',
    history: 'ประวัติกลุ่ม',
    admin: 'ตั้งค่าปฏิทิน',
    notifications: 'การแจ้งเตือน',
    preferences: 'ตั้งค่าของฉัน',
  }[name];
  $('#page-subtitle').textContent = {
    calendar: 'นัดหมาย วันสำคัญ และกิจกรรมที่ผ่านการอนุมัติ',
    mine: 'ติดตามข้อเสนอและผลการตรวจในที่เดียว',
    review: 'ช่วยดูแลข้อมูลก่อนเผยแพร่ให้ชุมชน',
    members: 'สมาชิกในกลุ่มเดียวกัน · สิทธิ์และวันที่เข้าร่วม',
    history: 'ใครทำอะไร เมื่อไหร่ · แสดงเวลาไทย',
    admin: 'ตั้งค่าการอนุมัติและแจ้งเตือนผู้จัดการ',
    notifications: 'เตือนวันพรุ่งนี้ วันกิจกรรม และก่อนเริ่มตามเวลาที่ตั้งไว้',
    preferences: 'เลือกการแจ้งเตือนให้เหมาะกับคุณ',
  }[name];

  try {
    if (await extended.open(name)) {
      return;
    }
  } catch (e) {
    toast(e.message);
    return;
  }

  if (name !== 'calendar') {
    const root = document.getElementById(name + '-list');
    root.replaceChildren(element('div', 'empty', 'กำลังโหลด…'));

    try {
      const events = await api(name === 'mine' ? '/api/mine' : '/api/review');
      root.replaceChildren();
      events.forEach((event) => root.append(proposalCard(event, name === 'review')));

      if (!events.length) {
        root.append(
          element(
            'div',
            'empty',
            name === 'mine'
              ? 'ยังไม่มีข้อเสนอ · กดส่งกิจกรรมใหม่เพื่อเริ่มต้น'
              : 'ตรวจครบแล้ว ไม่มีรายการรออนุมัติ',
          ),
        );
      }
    } catch (error) {
      root.replaceChildren(element('div', 'empty', error.message));
    }
  } else {
    render();
  }
}

$$('[data-page]').forEach((b) => (b.onclick = () => page(b.dataset.page)));
$$('[data-view]').forEach(
  (b) =>
    (b.onclick = () => {
      state.view = b.dataset.view;
      localStorage.setItem(`tutel-calendar-view:${state.groupId}`, state.view);

      if (state.session.user && state.group?.role) {
        void api('/api/preferences', {
          method: 'PUT',
          body: JSON.stringify({ view: state.view }),
        }).catch((e) => toast(e.message));
      }

      render();
    }),
);

function navigate(amount) {
  if (state.view === 'week') {
    state.date.setDate(state.date.getDate() + 7 * amount);
  } else {
    state.date = new Date(state.date.getFullYear(), state.date.getMonth() + amount, 1);
  }

  render();
}

$('#previous').onclick = () => navigate(-1);

$('#next').onclick = () => navigate(1);

$('#today').onclick = () => {
  state.date = new Date();
  state.selected = key(state.date);
  render();
};

$('#search').oninput = render;
$$('.filters input').forEach((input) => (input.onchange = render));
let touch;

$('#calendar').addEventListener(
  'touchstart',
  (e) => {
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  },
  { passive: true },
);

$('#calendar').addEventListener(
  'touchend',
  (e) => {
    if (!touch) {
      return;
    }

    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;

    if (Math.abs(dx) > 75 && Math.abs(dx) > Math.abs(dy) * 1.7) {
      navigate(dx < 0 ? 1 : -1);
    }

    touch = null;
  },
  { passive: true },
);

$('#login-open').onclick = () => $('#login-dialog').showModal();

$('#logout').onclick = async () => {
  try {
    await extended.disconnect();
    await api('/api/logout', { method: 'POST', body: '{}' });
    state.groupId = location.pathname.match(/^\/g\/([^/]+)/)?.[1] || '';
    await reload();
    await page('calendar');
  } catch (e) {
    toast(e.message);
  }
};

$$('[data-demo]').forEach(
  (b) =>
    (b.onclick = async () => {
      try {
        if (state.session.user) {
          await extended.disconnect();
        }

        await api('/api/demo', { method: 'POST', body: JSON.stringify({ role: b.dataset.demo }) });
        await reload();
        await page('calendar');
        toast('กำลังทดลองเป็น' + (b.dataset.demo === 'manager' ? 'ผู้จัดการ' : 'สมาชิก'));
      } catch (e) {
        toast(e.message);
      }
    }),
);

async function reload() {
  preferenceEpoch++;
  const epoch = preferenceEpoch;
  state.events = [];

  for (const id of [
    'calendar',
    'agenda',
    'members-list',
    'history-list',
    'mine-list',
    'review-list',
    'notification-list',
  ]) {
    document.getElementById(id)?.replaceChildren();
  }

  clearTimeout(saveTimer);
  const selectedGroup = state.groupId;
  const session = await api('/api/session');
  const groups = session.user ? await api('/api/groups') : [];
  const groupId = selectedGroup || session.user?.lastGroupId || groups[0]?.id || '';
  const noGroup = !groupId;
  let group = null;

  if (!noGroup) {
    try {
      group = await api('/api/group', { groupId });
    } catch (error) {
      if (![403, 404, 410].includes(error.status)) {
        throw error;
      }
      // Keep the selector usable after a membership is suspended or a saved group disappears.
      group = {
        id: groupId,
        slug: '',
        name: error.status === 410 ? 'ปฏิทินอยู่ในถังขยะ' : 'กลุ่มนี้ไม่พร้อมให้เข้าถึง',
        trashed: error.status === 410,
        role: null,
        canRead: false,
        visibility: 'private',
      };
      toast(error.message);
    }
  }

  const savedView = session.user ? await api('/api/account/view') : { groupIds: [] };
  const extraGroups = savedView.groupIds.filter((id) =>
    groups.some((g) => g.id === id && !g.suspended),
  );
  const events = noGroup
    ? await api('/api/public/events', { groupId: '' })
    : group?.canRead
      ? await api(
          '/api/events' +
            (session.user && group.role && extraGroups.length
              ? '?groups=' + encodeURIComponent(extraGroups.join(','))
              : ''),
          { groupId: group.id },
        )
      : [];
  catalog ||= await api('/api/catalog');
  const preferences =
    session.user && group?.role
      ? await api('/api/preferences', { groupId: group.id })
      : { ...catalog.defaults, categories: guestPreferences() };

  if (epoch !== preferenceEpoch) {
    return;
  }

  state.session = session;
  state.groups = groups;
  state.group = group;
  state.groupId = group?.id || '';
  state.events = events;
  categories = Object.fromEntries(catalog.categories.map((c) => [c.id, c.label]));
  state.view =
    preferences.view || localStorage.getItem(`tutel-calendar-view:${state.groupId}`) || 'month';

  if (state.session.user) {
    state.session.user.groupRole = state.group?.role;
    state.session.user.role = ['owner', 'manager'].includes(state.group?.role)
      ? 'manager'
      : 'member';
  }

  if (session.user && group?.role) {
    await api('/api/group/select', { method: 'POST', body: '{}', groupId: group.id });
  }

  await groupUI.refreshed();
  filters(preferences.categories);
  const categorySelect = $('#event-form').elements.category;
  categorySelect.replaceChildren();

  for (const c of catalog.categories) {
    const option = element('option', '', c.label);
    option.value = c.id;
    categorySelect.append(option);
  }

  const user = state.session.user;
  $('#demo-bar').hidden = !state.session.demo;
  $('#login-open').hidden = !!user;
  $('#logout').hidden = !user;
  $('#feedback-open').hidden = !user;
  $('#user-chip').hidden = !user;
  $('#user-chip').textContent = user
    ? `${user.name} · ${{ owner: 'เจ้าของ', manager: 'ผู้จัดการ', editor: 'ผู้แก้ไข', member: 'สมาชิก' }[state.group?.role] || (state.group?.externalAssistant ? 'ผู้ช่วยภายนอก' : 'ยังไม่ได้เข้ากลุ่ม')}`
    : '';
  $('#review-nav').hidden = user?.role !== 'manager';

  for (const provider of ['google', 'discord']) {
    const link = document.getElementById(provider + '-login');
    const disabled = !state.session.providers[provider];
    link.classList.toggle('disabled', disabled);
    link.setAttribute('aria-disabled', String(disabled));

    if (disabled) {
      link.removeAttribute('href');
    } else {
      link.href =
        '/auth/' +
        provider +
        '?returnTo=' +
        encodeURIComponent(location.pathname + location.search);
    }
  }

  $('#oauth-note').textContent = Object.values(state.session.providers).some(Boolean)
    ? ''
    : 'ปุ่มบัญชีจริงพร้อมให้เชื่อมหลังตั้ง OAuth · ตอนนี้ใช้ปุ่มทดลองบทบาทด้านบน';
  $('#oauth-note').hidden = Object.values(state.session.providers).some(Boolean);
  await extended.refreshed(catalog, preferences);
  await page('calendar');
  render();
}

reload()
  .then(async () => {
    window.dispatchEvent(new Event('tutel:ready'));
    const invite = location.pathname.match(/^\/invite\/([^/]+)/);
    const connect = location.pathname.match(/^\/connect\/([^/]+)/);

    if (invite) {
      await groupUI.join(decodeURIComponent(invite[1]));
    }

    if (connect) {
      await groupUI.connect(decodeURIComponent(connect[1]));
    }

    const params = new URLSearchParams(location.search);
    const requestedDate = params.get('date');

    if (
      /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '') &&
      Number.isFinite(localDate(requestedDate).valueOf())
    ) {
      state.date = localDate(requestedDate);
      state.selected = requestedDate;
      render();
    }

    const event = state.events.find(
      (e) =>
        e.id === params.get('event') ||
        (e.source_id &&
          e.source_id === params.get('event') &&
          (params.get('at')
            ? e.source_occurrence === params.get('at')
            : !requestedDate || e.date === requestedDate)),
    );

    if (event) {
      state.date = localDate(event.date);
      state.selected = event.date;
      render();
      detail(event);
    }

    if (params.has('notifications') && state.session.user) {
      await page('notifications');
    }
  })
  .catch((error) => {
    if (!$('#app-loading').hidden) {
      window.dispatchEvent(new Event('tutel:load-error'));
    } else {
      toast(error.message);
    }
  });

if (new URLSearchParams(location.search).has('auth')) {
  toast('เข้าสู่ระบบไม่สำเร็จ ตรวจการตั้งค่า OAuth แล้วลองใหม่');
  const params = new URLSearchParams(location.search);
  params.delete('auth');
  history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : ''));
}

window.addEventListener('popstate', () => {
  state.groupId = decodeURIComponent(location.pathname.match(/^\/g\/([^/]+)/)?.[1] || '');
  void reload().catch((e) => toast(e.message));
});
