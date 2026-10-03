// Small UI toolkit: element builder, icons, toasts, sheets, formatting helpers.

/** h('div.card#id', {onclick, class, hidden}, child, [children], 'text') */
export function h(tag, props, ...kids) {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  for (const r of rest) r[0] === '.' ? el.classList.add(r.slice(1)) : (el.id = r.slice(1));
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (k) => { if (Array.isArray(k)) k.forEach(add); else if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(k)); };
  kids.forEach(add);
  return el;
}

const P = {
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 7h6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  cart: '<path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-9-9.5C2 7 4.5 4.5 7.3 4.5c1.9 0 3.5 1 4.7 2.8 1.2-1.8 2.8-2.8 4.7-2.8 2.8 0 5.3 2.5 4.3 6C19.5 15.4 12 20 12 20z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5 6.5-5s5.700 1.500 6.500 5M16 4.700a3.500 3.500 0 0 1 0 6.600M18 15c2 .6 3.300 2 3.800 5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', link: '<path d="M10 14a4 4 0 0 0 5.600 0l3-3a4 4 0 0 0-5.600-5.600l-1 1M14 10a4 4 0 0 0-5.600 0l-3 3a4 4 0 0 0 5.600 5.600l1-1"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', back: '<path d="M15 5l-7 7 7 7"/>', flame: '<path d="M12 3c1 4 5 5.500 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 2.500 2 2.500C11 9 11 6 12 3z"/>',
  move: '<path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  pot: '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 10h20M9 6c0-1.500 1.500-1.500 1.500-3M14 6c0-1.500 1.500-1.500 1.500-3"/>',
};
export function icon(name, filled) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', filled ? 'currentColor' : 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = P[name] || ''; return s;
}

export const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#d4553a"/><circle cx="32" cy="34" r="12" fill="#fbf5ea"/>
<g stroke="#fbf5ea" stroke-width="3" stroke-linecap="round"><path d="M32 8v5M14 15l3.500 3.500M50 15l-3.500 3.500M8 32h5M51 32h5"/></g>
<g fill="none" stroke="#2a2118" stroke-width="2.800" stroke-linecap="round"><path d="M26 28v7a3 3 0 0 0 6 0v-7M29 28v20M38 28c-2 3-2 8 0 10v10"/></g></svg>`;
export const logo = () => h('span', { html: LOGO, style: 'display:contents' });

// ---- toasts
export function toast(msg, kind = '') {
  const box = document.getElementById('toasts'); if (!box) return;
  const t = h('div.toast', { class: kind, role: 'status' }, msg); box.append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, kind === 'err' ? 4500 : 2400);
}
export const errToast = (e) => toast(e?.detail || e?.message || 'Something went sideways.', 'err');

// ---- sheet: returns {close, el}. content is a Node or array
export function sheet(...content) {
  const prev = document.activeElement;
  const scrim = h('div.scrim', { onclick: (e) => e.target === scrim && close() }, h('div.sheet', { role: 'dialog', 'aria-modal': 'true' }, content));
  function close() { scrim.remove(); prev?.focus?.(); }
  document.body.append(scrim); return { close, el: scrim };
}
/** Confirm dialog (native confirm() is unavailable in standalone PWAs). Resolves true/false. */
export function confirmSheet(title, text, yes = 'Yes', danger = false) {
  return new Promise((res) => {
    const s = sheet(h('h2', title), text && h('p.muted', text),
      h('div.row', h('button.btn.grow', { onclick: () => { s.close(); res(false); } }, 'Never mind'),
        h('button.btn.primary.grow', { class: danger ? 'danger' : '', onclick: () => { s.close(); res(true); } }, yes)));
  });
}
export function promptSheet(title, value = '', ok = 'Save', placeholder = '') {
  return new Promise((res) => {
    const input = h('input', { type: 'text', value, placeholder });
    const done = (v) => { s.close(); res(v); };
    const s = sheet(h('h2', title), input, h('div.row', h('button.btn.grow', { onclick: () => done(null) }, 'Cancel'),
      h('button.btn.primary.grow', { onclick: () => done(input.value.trim() || null) }, ok)));
    input.addEventListener('keydown', (e) => e.key === 'Enter' && done(input.value.trim() || null));
    setTimeout(() => input.focus(), 50);
  });
}

// ---- formatting
const FR = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.333: '⅓', 0.667: '⅔', 0.125: '⅛' };
export function fmtQty(q) {
  if (q == null || q === '') return '';
  const whole = Math.floor(q + 1e-6), frac = q - whole;
  if (frac < 0.04) return String(whole || 0);
  for (const [v, s] of Object.entries(FR)) if (Math.abs(frac - v) < 0.04) return (whole ? whole : '') + s;
  return String(Math.round(q * 100) / 100);
}
export const fmtMins = (m) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m} min`);
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

const HUES = ['#d4553a', '#c98a3c', '#7d9a78', '#b5654a', '#8a7b5c', '#a9594b'];
/** Recipe image, or a tasteful colored placeholder if none / broken. */
export function recipeImg(r, alt = '') {
  const ph = () => h('div.placeholder', { style: `background:linear-gradient(135deg,${HUES[(r?.id || 0) % HUES.length]},#e9b872)` }, icon('pot'));
  if (!r?.image_url) return ph();
  const img = h('img', { src: r.image_url, alt, loading: 'lazy', decoding: 'async' });
  const wrap = h('div', { style: 'width:100%;height:100%' }, img);
  img.addEventListener('error', () => wrap.replaceChildren(ph()));
  return wrap;
}
export const skeleton = (n, cls = '', style = '') => Array.from({ length: n }, () => h('div.skel', { class: cls, style }));
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const empty = (big, title, text, ...actions) => h('div.empty', h('div.big', big), h('h2', title), text && h('p', text), actions);
export function greeting(name) {
  const hr = new Date().getHours();
  const g = hr < 11 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  return `${g}${name ? ', ' + name : ''}`;
}
