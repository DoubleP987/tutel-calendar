// End the splash when data is ready; never enforce an animation delay.
const loading = document.querySelector('#app-loading');
const layout = document.querySelector('.layout');
const message = document.querySelector('#loading-message');
const retry = document.querySelector('#loading-retry');
layout.inert = true;
layout.setAttribute('aria-busy', 'true');
retry.onclick = () => location.reload();
const slowTimer = setTimeout(() => {
  if (loading.hidden) return;
  message.textContent = 'กำลังรอข้อมูล อาจใช้เวลานานกว่าปกติ';
  retry.hidden = false;
}, 15000);
window.addEventListener(
  'tutel:ready',
  () => {
    clearTimeout(slowTimer);
    loading.hidden = true;
    layout.inert = false;
    layout.setAttribute('aria-busy', 'false');
  },
  { once: true },
);
function failed() {
  if (loading.hidden) return;
  clearTimeout(slowTimer);
  loading.classList.add('loading-failed');
  message.textContent = 'โหลดปฏิทินไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง';
  retry.hidden = false;
}
window.addEventListener('tutel:load-error', failed);
window.addEventListener('error', failed, { once: true });
