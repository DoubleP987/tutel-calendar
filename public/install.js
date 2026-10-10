/** Mobile installation is offered once per browser; the sidebar always reopens the guide. */
export function setupInstallation({ closeSidebar, toast }) {
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(navigator.userAgent);
  if (!ios && !android) return;
  const entry = document.querySelector('#install-open');
  const standalone = matchMedia('(display-mode: standalone)');
  const isInstalled = () =>
    installedThisVisit || standalone.matches || navigator.standalone === true;
  const seenKey = 'tutel-calendar-install-intro-v1';
  let promptEvent;
  let installedThisVisit = false;
  let seenThisVisit = false;
  let automaticTimer;
  const dialog = document.createElement('dialog');
  dialog.id = 'install-dialog';
  dialog.setAttribute('aria-labelledby', 'install-title');
  dialog.innerHTML = `
    <div class="dialog-header">
      <h2 id="install-title">ปฏิทินใกล้มือกว่าเดิม</h2>
      <button type="button" class="close" aria-label="ปิดคำแนะนำ">×</button>
    </div>
    <div class="install-content">
      <img class="install-app-icon" src="/assets/app-icon.png" alt="" />
      <h3>Tutel📅 บนหน้าจอโฮม</h3>
      <p>เปิดปฏิทินได้จากไอคอนบนมือถือเหมือนแอป ไม่ต้องค้นหาเว็บทุกครั้ง</p>
      <div id="install-instructions"></div>
      <button type="button" id="install-now" class="primary">ติดตั้งแอป</button>
      <a class="install-guide-link" href="/install.html" target="_blank" rel="noopener">คู่มือสำหรับ iPhone, iPad และ Android</a>
      <button type="button" id="install-later">ไว้ทีหลัง</button>
      <p class="fine">เปิดคำแนะนำนี้อีกครั้งได้จากปุ่มด้านล่างเมนูด้านข้าง</p>
    </div>`;
  document.body.append(dialog);
  const action = dialog.querySelector('#install-now');
  const instructions = dialog.querySelector('#install-instructions');
  function update() {
    entry.hidden = isInstalled();
    if (isInstalled() && dialog.open) dialog.close();
    action.hidden = ios || !promptEvent;
    instructions.innerHTML = ios
      ? `<p class="install-platform">สำหรับ iPhone / iPad</p>
         <ol><li>เปิดเว็บนี้ใน <strong>Safari</strong></li>
         <li>แตะ <strong>แชร์</strong> <svg class="install-share-icon" viewBox="0 0 24 24" aria-label="ไอคอนแชร์" role="img"><path d="M12 16V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/></svg> (อาจอยู่ในเมนูเพิ่มเติม)</li>
         <li>เลือก <strong>เพิ่มไปยังหน้าจอโฮม</strong> (Add to Home Screen)</li>
         <li>ถ้ามี <strong>เปิดเป็นเว็บแอป</strong> ให้เปิด แล้วแตะ <strong>เพิ่ม</strong></li></ol>
         <p class="fine">ไม่พบตัวเลือก? เลื่อนลงในเมนูแชร์ หรือเลือกแก้ไขการทำงานเพื่อเพิ่มตัวเลือกนี้</p>`
      : promptEvent
        ? '<p class="install-platform">สำหรับ Android</p><p>กดติดตั้งแอปด้านล่าง แล้วกดยืนยันในหน้าต่างของเบราว์เซอร์</p>'
        : '<p class="install-platform">สำหรับ Android</p><p>หากปุ่มติดตั้งยังไม่ขึ้น ให้เปิดเว็บใน Chrome แล้วเลือกเมนู <strong>⋮ → ติดตั้งแอป / เพิ่มลงในหน้าจอหลัก</strong> ถ้าเปิดจากแชท ให้เลือกเปิดในเบราว์เซอร์ก่อน</p>';
  }
  function markSeen() {
    seenThisVisit = true;
    try {
      localStorage.setItem(seenKey, 'seen');
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
  }
  function hasSeen() {
    if (seenThisVisit) return true;
    try {
      return localStorage.getItem(seenKey) === 'seen';
    } catch {
      return false;
    }
  }
  function open() {
    if (isInstalled()) return;
    closeSidebar(false);
    update();
    markSeen();
    if (!dialog.open) dialog.showModal();
  }
  entry.onclick = open;
  dialog.querySelector('.close').onclick = () => dialog.close();
  dialog.querySelector('#install-later').onclick = () => dialog.close();
  dialog.addEventListener('close', () => document.querySelector('#sidebar-toggle')?.focus());
  action.onclick = async () => {
    const event = promptEvent;
    if (!event) return;
    promptEvent = null;
    action.disabled = true;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') {
        dialog.close();
        toast('รับคำขอติดตั้งแล้ว รอเบราว์เซอร์เพิ่มแอป');
      }
    } catch {
      toast('เปิดหน้าติดตั้งไม่ได้ ใช้เมนูติดตั้งในเบราว์เซอร์ได้ครับ');
    } finally {
      action.disabled = false;
      update();
    }
  };
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    promptEvent = event;
    update();
  });
  window.addEventListener('appinstalled', () => {
    installedThisVisit = true;
    promptEvent = null;
    entry.hidden = true;
    markSeen();
    if (dialog.open) dialog.close();
  });
  standalone.addEventListener('change', update);
  update();
  const started = Date.now();
  function offerOnce() {
    if (hasSeen() || isInstalled() || Date.now() - started > 180000) return;
    // Do not interrupt login, invitations, editing, or another active dialog.
    if (
      document.hidden ||
      !document.querySelector('#app-loading')?.hidden ||
      document.querySelector('dialog[open]') ||
      document.body.classList.contains('sidebar-open')
    ) {
      automaticTimer = setTimeout(offerOnce, 5000);
      return;
    }
    open();
  }
  automaticTimer = setTimeout(offerOnce, 5000);
  window.addEventListener('pagehide', () => clearTimeout(automaticTimer), { once: true });
}
