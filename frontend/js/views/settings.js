// Settings: profile switch, theme, pantry, install instructions.
import { api, store } from '../api.js';
import { h, icon, errToast, toast, sheet } from '../ui.js';
import { go } from '../router.js';
import { avatar } from './who.js';

export default async function settings(root) {
  const p = store.profile || {};
  const theme = (() => { try { return localStorage.getItem('fc_theme') || 'auto'; } catch { return 'auto'; } })();
  const setTheme = (t) => { try { t === 'auto' ? localStorage.removeItem('fc_theme') : localStorage.setItem('fc_theme', t); } catch {} t === 'auto' ? delete document.documentElement.dataset.theme : (document.documentElement.dataset.theme = t); paintTheme(t); };
  const themeSeg = h('div.seg'); const paintTheme = (cur) => themeSeg.replaceChildren(...['auto', 'light', 'dark'].map((t) => h('button', { class: cur === t ? 'on' : '', onclick: () => setTheme(t) }, t)));
  const pantry = h('div'); const ver = h('p.muted.small');

  async function loadPantry() {
    try {
      const names = await api.pantry();
      pantry.replaceChildren(...(names.length ? names.map((n) => h('div.list-row', h('span.grow', n.name || n), h('button.btn.ghost', { onclick: async () => { try { await api.delPantry(n.name || n); loadPantry(); } catch (e) { errToast(e); } } }, 'Remove')))
        : [h('p.muted', 'Nothing here yet. Tap “Have it” on a shopping item and it will be remembered.')]));
    } catch (e) { pantry.replaceChildren(h('p.muted', e.detail)); }
  }
  root.append(h('div.head', h('div', h('p.eyebrow', 'Your kitchen'), h('h1', 'Settings'))), h('div.stack',
    h('div.panel.stack', h('h3', 'Who’s cooking'), h('div.row', avatar(p, 'sm'), h('b.grow', p.name || 'Nobody yet'), h('button.btn', { onclick: () => go('/who') }, 'Switch'))),
    h('div.panel.stack', h('h3', 'Look & feel'), themeSeg),
    h('div.panel', h('h3', 'Pantry — things we always have'), h('p.muted.small', 'These are skipped as “already have it” on new shopping lists.'), pantry),
    h('div.panel.stack', h('h3', 'Install as an app'), h('ol', { style: 'padding-left:20px;margin:0;display:grid;gap:6px' },
      h('li', 'Open Forkcast in Safari on your iPhone.'), h('li', 'Tap the Share button (square with arrow).'), h('li', 'Choose “Add to Home Screen”, then Add.'), h('li', 'Launch it from the icon — full screen, no browser bars.')),
      h('p.muted.small', 'Tip: set up the iPhone Shortcut (docs/SHORTCUT.md) to send recipes from Safari or social apps straight to Forkcast.')), ver));
  paintTheme(theme); loadPantry();
  api.health().then((x) => (ver.textContent = 'Forkcast v' + (x.version || '?'))).catch(() => {});
}
