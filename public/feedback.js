const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Static markup only. Account names and other user content use textContent below.
const FEEDBACK_FORM = /* HTML */ `
  <form class="feedback-form">
    <div class="feedback-heading">
      <h2>Feedback</h2>
      <button type="button" class="icon" data-feedback-close aria-label="ปิด">✕</button>
    </div>
    <p class="muted">แจ้งปัญหาหรือเสนอแนะให้เราปรับปรุงปฏิทิน</p>
    <label>
      ประเภท
      <select name="category">
        <option value="problem">แจ้งปัญหา</option>
        <option value="suggestion">เสนอแนะ</option>
        <option value="other">อื่น ๆ</option>
      </select>
    </label>
    <label>
      หัวข้อ
      <input name="title" maxlength="120" required placeholder="อยากให้เราช่วยเรื่องอะไร" />
    </label>
    <label>
      รายละเอียด
      <textarea
        name="message"
        maxlength="5000"
        rows="5"
        required
        placeholder="เล่าเพิ่มเติมได้เลย"
      ></textarea>
    </label>
    <label class="feedback-upload">
      แนบรูปภาพ
      <small>JPG, PNG, WebP · สูงสุด 3 รูป · รูปละ 5 MB</small>
      <input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple />
    </label>
    <div class="feedback-previews"></div>
    <p class="feedback-context muted"></p>
    <p class="feedback-error" role="alert" hidden></p>
    <div class="feedback-actions">
      <button type="button" data-feedback-close>ยกเลิก</button>
      <button class="primary" type="submit">ส่ง Feedback</button>
    </div>
  </form>
`;

/** Keep a draft while the dialog is closed; submit with the current session's CSRF token. */
export function setupFeedback({ state, toast, closeSidebar }) {
  const trigger = document.querySelector('#feedback-open');
  const dialog = document.createElement('dialog');
  dialog.className = 'feedback-dialog';
  dialog.setAttribute('aria-label', 'ส่ง Feedback');
  dialog.innerHTML = FEEDBACK_FORM;
  document.body.append(dialog);

  const form = dialog.querySelector('form');
  const fileInput = form.elements.images;
  const submit = form.querySelector('[type=submit]');
  const error = dialog.querySelector('.feedback-error');
  let files = [];
  let urls = [];
  let sending = false;
  let context;

  function report(message) {
    error.textContent = message;
    error.hidden = !message;
  }

  function previews() {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = [];
    const container = dialog.querySelector('.feedback-previews');
    container.replaceChildren();
    files.forEach((file, index) => {
      const card = document.createElement('div');
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      urls.push(img.src);
      img.alt = file.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '✕';
      remove.setAttribute('aria-label', 'ลบรูป ' + (index + 1));
      remove.disabled = sending;

      remove.onclick = () => {
        files.splice(index, 1);
        previews();
      };

      card.append(img, remove);
      container.append(card);
    });
  }

  fileInput.onchange = () => {
    const incoming = [...fileInput.files];
    fileInput.value = '';

    if (files.length + incoming.length > MAX_IMAGES) {
      return report('แนบได้สูงสุด 3 รูป');
    }

    if (incoming.some((file) => file.size > MAX_IMAGE_BYTES || !IMAGE_TYPES.includes(file.type))) {
      return report('ใช้ JPG, PNG หรือ WebP รูปละไม่เกิน 5 MB');
    }

    files.push(...incoming);
    report('');
    previews();
  };

  trigger.onclick = () => {
    if (!state.session.user) {
      return toast('กรุณาเข้าสู่ระบบก่อนส่ง Feedback');
    }

    closeSidebar(false);
    context = {
      userId: state.session.user.id,
      groupId: state.group?.role ? state.group.id : '',
      pagePath:
        location.pathname.startsWith('/invite/') || location.pathname.startsWith('/connect/')
          ? '/'
          : location.pathname,
    };
    dialog.querySelector('.feedback-context').textContent =
      `ส่งพร้อมชื่อบัญชี${context.groupId ? ' และชื่อกลุ่ม ' + state.group.name : ''} หน้าที่เปิด และเวลาส่ง`;
    report('');
    previews();
    dialog.showModal();
  };

  dialog.querySelectorAll('[data-feedback-close]').forEach(
    (button) =>
      (button.onclick = () => {
        if (!sending) {
          dialog.close();
        }
      }),
  );

  dialog.addEventListener('cancel', (event) => {
    if (sending) {
      event.preventDefault();
    }
  });

  dialog.addEventListener('close', () => {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = [];
    dialog.querySelector('.feedback-previews').replaceChildren();
    trigger.focus();
  });

  form.onsubmit = async (event) => {
    event.preventDefault();

    if (sending) {
      return;
    }

    if (state.session.user?.id !== context.userId) {
      return report('บัญชีเปลี่ยนไป กรุณาปิดแล้วเปิด Feedback ใหม่');
    }

    const data = new FormData();

    for (const key of ['category', 'title', 'message']) {
      data.append(key, form.elements[key].value.trim());
    }

    data.append('groupId', context.groupId);
    data.append('pagePath', context.pagePath);
    files.forEach((file) => data.append('images', file));
    sending = true;
    submit.textContent = 'กำลังส่ง…';
    report('');
    [...form.elements].forEach((field) => (field.disabled = true));

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'x-csrf-token': state.session.csrf || '' },
        body: data,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || 'ส่งไม่สำเร็จ กรุณาลองใหม่');
      }

      files = [];
      form.reset();
      dialog.close();
      previews();
      toast('ส่ง Feedback แล้ว ขอบคุณครับ');
    } catch (issue) {
      report(issue.message);
    } finally {
      sending = false;
      [...form.elements].forEach((field) => (field.disabled = false));
      submit.textContent = 'ส่ง Feedback';
    }
  };
}
