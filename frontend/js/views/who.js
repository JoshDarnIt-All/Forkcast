// "Who's cooking?" profile picker.
import { api, store } from '../api.js';
import { h, LOGO, errToast, promptSheet } from '../ui.js';
import { go } from '../router.js';
import { refreshPlan } from '../state.js';

export const COLORS = ['#d4553a', '#7d9a78', '#c98a3c', '#6b8cae', '#a9594b', '#8a6fa8'];
export const avatar = (p, cls = '') => h('span.avatar', { class: cls, style: `background:${p.color || COLORS[0]}` }, (p.name || '?')[0].toUpperCase());

export default async function who(root) {
  const row = h('div.profiles', ...[1, 2].map(() => h('div.skel', { style: 'width:96px;height:96px;border-radius:50%' })));
  root.append(h('div.who', h('span', { html: LOGO, style: 'display:contents' }),
    h('div', h('p.eyebrow', 'Forkcast · your dinner forecast'), h('h1', "Who's cooking?")), row,
    h('button.btn.ghost', { onclick: addProfile }, 'Someone new in the kitchen?')));
  async function load() {
    try {
      const ps = await api.profiles();
      row.replaceChildren(...ps.map((p) => h('button.profile', { onclick: () => pick(p) }, avatar(p), p.name)));
    } catch (e) { errToast(e); row.replaceChildren(h('p.muted', 'Could not load profiles. Pull to retry.')); }
  }
  async function pick(p) { store.profile = p; refreshPlan(); go('/'); }
  async function addProfile() {
    const name = await promptSheet("What's your name?", '', 'Join the kitchen');
    if (!name) return;
    try { const used = row.children.length; await api.addProfile({ name, color: COLORS[used % COLORS.length] }); load(); } catch (e) { errToast(e); }
  }
  load();
}
