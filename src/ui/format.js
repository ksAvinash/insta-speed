/** Shared number/text formatting for the UI. */

export const int = (n) => Math.round(n).toLocaleString();

export const metres = (m) =>
  m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(m < 10 ? 2 : 0)} m`;

export const kg = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} t` : `${int(m)} kg`);

export const seconds = (s) => `${s.toFixed(2)} s`;

/** @param {Record<string, string>} entries */
export function renderStats(el, entries, blurb) {
  el.innerHTML = '';
  for (const [label, value] of Object.entries(entries)) {
    const wrap = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    wrap.append(dt, dd);
    el.append(wrap);
  }
  if (blurb) {
    const p = document.createElement('div');
    p.className = 'blurb';
    p.textContent = blurb;
    el.append(p);
  }
}
