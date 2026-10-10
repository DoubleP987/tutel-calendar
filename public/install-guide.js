const themeKey = 'tutel-install-guide-theme';
let theme;
try {
  theme = localStorage.getItem(themeKey) || localStorage.getItem('tutel-calendar-theme');
} catch {
  /* Browser storage is optional. */
}
document.documentElement.dataset.theme =
  theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.querySelector('#guide-theme').onclick = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(themeKey, next);
  } catch {
    /* Keep the choice for this page. */
  }
};
