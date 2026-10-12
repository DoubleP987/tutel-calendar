/** Browser controls use scoped APIs; permission checks remain on the server. */
export function announcementUI({ api, state, element, toast }) {
  const actions = element('div', 'workspace-actions announcement-actions');
  const send = element('button', 'primary', 'ส่งประกาศ');
  send.type = 'button';
  actions.append(send);
  let dialog;

  function compose() {
    if (!state.group?.canAnnounce) {
      return;
    }

    dialog?.remove();
    dialog = element('dialog', 'announcement-dialog');
    const group = { ...state.group };
    const header = element('div', 'dialog-header');
    const close = element('button', 'close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'ปิดประกาศ');

    close.onclick = () => dialog.close();

    header.append(element('h2', '', 'ส่งประกาศ'), close);
    const form = element('form', 'form-content');
    form.append(
      element('p', 'notice', `ส่งเฉพาะสมาชิกกลุ่ม ${group.name} · ไม่เพิ่มกิจกรรมในปฏิทิน`),
    );
    const titleLabel = element('label', '', 'หัวข้อ');
    const title = element('input');
    title.required = true;
    title.maxLength = 120;
    titleLabel.append(title);
    const bodyLabel = element('label', '', 'รายละเอียด');
    const body = element('textarea');
    body.required = true;
    body.maxLength = 2000;
    body.rows = 6;
    bodyLabel.append(body);
    const preview = element('article', 'proposal announcement-preview');
    const heading = element('strong');
    const text = element('p', 'announcement-text');
    preview.append(element('small', 'muted', 'ตัวอย่างการแจ้งเตือน'), heading, text);

    const refresh = () => {
      heading.textContent = title.value || 'หัวข้อประกาศ';
      text.textContent = body.value || 'ข้อความของคุณ';
    };

    title.oninput = refresh;
    body.oninput = refresh;
    refresh();
    const error = element('p', 'error');
    error.setAttribute('role', 'alert');
    const submit = element('button', 'primary', 'ส่งตอนนี้');
    submit.type = 'submit';
    const requestId = crypto.randomUUID();
    form.append(titleLabel, bodyLabel, preview, error, submit);

    form.onsubmit = async (event) => {
      event.preventDefault();

      if (submit.disabled) {
        return;
      }

      submit.disabled = true;
      close.disabled = true;
      error.textContent = '';

      try {
        await api('/api/group/announcements', {
          method: 'POST',
          groupId: group.id,
          body: JSON.stringify({ title: title.value, body: body.value, requestId }),
        });
        dialog.close();
        toast('เข้าคิวส่งประกาศให้สมาชิกแล้ว');
      } catch (issue) {
        error.textContent = issue.message;
      } finally {
        submit.disabled = false;
        close.disabled = false;
      }
    };

    dialog.addEventListener('cancel', (event) => {
      if (submit.disabled) {
        event.preventDefault();
      }
    });

    dialog.append(header, form);
    document.body.append(dialog);
    dialog.showModal();
  }

  send.onclick = compose;
  return {
    render(root) {
      actions.hidden = !state.group?.canAnnounce;
      root.prepend(actions);
    },
  };
}

export async function manageCapabilities({ api, state, element, toast }) {
  const groupId = state.groupId;
  const data = await api('/api/group/capabilities');
  const dialog = element('dialog', 'announcement-dialog');
  const header = element('div', 'dialog-header');
  const close = element('button', 'close', '×');
  close.type = 'button';

  close.onclick = () => dialog.close();

  close.setAttribute('aria-label', 'ปิดสิทธิ์พิเศษ');
  header.append(element('h2', '', 'สิทธิ์พิเศษของกลุ่ม'), close);
  const content = element('div', 'form-content');
  content.append(
    element('h3', '', 'ผู้ช่วยจัดการภายนอก'),
    element(
      'p',
      'fine',
      'อ่านและลบกิจกรรมของกลุ่มได้ ไม่เป็นสมาชิกและไม่รับแจ้งเตือน ให้ผู้ช่วยเข้าสู่ระบบด้วยบัญชีที่ยืนยันอีเมลก่อน',
    ),
  );
  const form = element('form');
  const label = element('label', '', 'อีเมลบัญชีผู้ช่วย');
  const email = element('input');
  email.type = 'email';
  email.required = true;
  label.append(email);
  const submit = element('button', '', 'เพิ่มผู้ช่วย');
  submit.type = 'submit';
  form.append(label, submit);
  content.append(form);
  const assistants = element('div');
  content.append(assistants);

  function assistantRow(user) {
    const row = element('article', 'proposal');
    const revoke = element('button', 'danger', 'ถอนสิทธิ์');
    revoke.type = 'button';

    revoke.onclick = async () => {
      revoke.disabled = true;

      try {
        await api(`/api/group/assistants/${encodeURIComponent(user.id)}`, {
          method: 'DELETE',
          groupId,
        });
        row.remove();
      } catch (error) {
        toast(error.message);
        revoke.disabled = false;
      }
    };

    row.append(element('strong', '', user.name), revoke);
    assistants.append(row);
  }

  data.assistants.forEach(assistantRow);

  form.onsubmit = async (event) => {
    event.preventDefault();
    submit.disabled = true;

    try {
      await api('/api/group/assistants', {
        method: 'POST',
        groupId,
        body: JSON.stringify({ email: email.value }),
      });
      const latest = await api('/api/group/capabilities', { groupId });
      assistants.replaceChildren();
      latest.assistants.forEach(assistantRow);
      form.reset();
      toast('มอบสิทธิ์แล้ว');
    } catch (error) {
      toast(error.message);
    } finally {
      submit.disabled = false;
    }
  };

  content.append(
    element('h3', '', 'ผู้จัดการที่ส่งประกาศได้'),
    element('p', 'fine', 'เจ้าของส่งได้เสมอ สิทธิ์นี้ใช้ได้เฉพาะขณะที่บัญชียังเป็นผู้จัดการกลุ่ม'),
  );

  for (const user of data.managers) {
    const label = element('label');
    const input = element('input');
    input.type = 'checkbox';
    input.checked = !!user.canAnnounce;

    input.onchange = async () => {
      input.disabled = true;

      try {
        await api(`/api/group/announcement-managers/${encodeURIComponent(user.id)}`, {
          method: 'PUT',
          groupId,
          body: JSON.stringify({ enabled: input.checked }),
        });
      } catch (error) {
        input.checked = !input.checked;
        toast(error.message);
      } finally {
        input.disabled = false;
      }
    };

    label.append(input, document.createTextNode(' ' + user.name));
    content.append(label);
  }

  dialog.append(header, content);

  dialog.addEventListener('close', () => dialog.remove(), { once: true });

  document.body.append(dialog);
  dialog.showModal();
}
