// Shopping list: store-section order, big tap targets, optimistic check/owned, swipe-left = "I already have this".
import { api } from '../api.js';
import { h, icon, errToast, toast, fmtQty, empty, skeleton } from '../ui.js';
import { state, refreshPlan } from '../state.js';
import { go } from '../router.js';

const rank = (i) => (i.owned ? 2 : i.checked ? 1 : 0);

export default async function shopping(root, { params }) {
  const list = h('div'); const bar = h('i'); const count = h('span.muted.small');
  let planId = params.id ? Number(params.id) : null, data = null;
  const picker = h('select', { 'aria-label': 'Which plan', onchange: () => go('/shop/' + picker.value) });
  const nameIn = h('input', { type: 'text', placeholder: 'Add something (e.g. paper towels)', enterKeyHint: 'done', 'aria-label': 'Add item' });
  const clearBtn = h('button.btn.sage', { onclick: clear }, 'Clear checked');
  root.append(h('div.head', h('div', h('p.eyebrow', 'Aisle by aisle'), h('h1', 'Shopping list'))), picker,
    h('form.row', { style: 'margin:14px 0', onsubmit: addCustom }, nameIn, h('button.btn.primary', { type: 'submit', 'aria-label': 'Add' }, icon('plus'))),
    h('div.row', { style: 'justify-content:space-between;margin-bottom:8px' }, count, clearBtn), h('div.progress', bar), list);
  list.append(...skeleton(5, '', 'height:56px;margin-top:12px'));

  try {
    const [cur, saved] = await Promise.all([state.plan || refreshPlan(), api.plans().catch(() => [])]);
    if (!planId) planId = cur?.id;
    picker.replaceChildren(h('option', { value: cur?.id }, 'Next meal plan (draft)'), ...saved.map((p) => h('option', { value: p.id }, p.name)));
    picker.value = planId;
    await load();
  } catch (e) { errToast(e); }

  async function load() {
    try { data = await api.shopping(planId); paint(); } catch (e) { errToast(e); list.replaceChildren(empty('🌧️', 'Could not build the list', e.detail, h('button.btn', { onclick: load }, 'Retry'))); }
  }
  function all() { return data.sections.flatMap((s) => s.items); }
  function paint() {
    const items = all(); const done = items.filter((i) => i.checked || i.owned).length;
    count.textContent = items.length ? `${done} of ${items.length} sorted` : ''; bar.style.width = items.length ? (done / items.length) * 100 + '%' : 0;
    clearBtn.hidden = !items.some((i) => i.checked);
    if (!items.length) return list.replaceChildren(empty('🛒', 'Nothing to buy — yet', 'Add recipes to your meal plan and the list writes itself.', h('a.btn.primary', { href: '#/plan' }, 'See meal plan')));
    list.replaceChildren(...data.sections.map((s) => h('section.sec', h('h3', s.section),
      [...s.items].map((it, i) => [it, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([it]) => row(it)))));
  }
  async function patch(it, change) {
    const old = { checked: it.checked, owned: it.owned }; Object.assign(it, change); paint();
    try { await api.patchShop(it.id, change); if ('owned' in change) toast(it.owned ? 'Got it — we’ll remember you have this' : 'Back on the list'); }
    catch (e) { Object.assign(it, old); paint(); errToast(e); }
  }
  function row(it) {
    const qty = [fmtQty(it.quantity), it.unit].filter(Boolean).join(' ');
    const tick = h('button.tick', { 'aria-label': 'Check off ' + it.name, 'aria-pressed': it.checked, onclick: () => patch(it, { checked: !it.checked }) }, icon('check'));
    const own = h('button.own', { onclick: () => patch(it, { owned: !it.owned }) }, it.owned ? 'Have it ✓' : 'Have it');
    const inner = h('div.in', tick, h('div.grow', h('div.nm', it.name), qty && h('div.qty', qty)), it.custom ? h('button.icon-btn', { 'aria-label': 'Delete', onclick: () => delItem(it) }, icon('x')) : null, own);
    const el = h('div.srow', { class: (it.checked ? 'checked ' : '') + (it.owned ? 'owned' : '') }, h('div.swipe-bg', it.owned ? 'Back on the list' : 'I have this'), inner);
    let x0 = null, dx = 0;
    el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; dx = 0; inner.style.transition = 'none'; }, { passive: true });
    el.addEventListener('touchmove', (e) => { if (x0 == null) return; dx = Math.min(0, e.touches[0].clientX - x0); inner.style.transform = `translateX(${dx}px)`; }, { passive: true });
    el.addEventListener('touchend', () => { inner.style.transition = ''; inner.style.transform = ''; if (x0 != null && dx < -90) patch(it, { owned: !it.owned }); x0 = null; });
    return el;
  }
  async function addCustom(e) {
    e.preventDefault(); const name = nameIn.value.trim(); if (!name) return; nameIn.value = '';
    try { await api.addShop(planId, { name }); await load(); } catch (er) { errToast(er); nameIn.value = name; }
  }
  async function delItem(it) {
    data.sections.forEach((s) => (s.items = s.items.filter((x) => x !== it))); data.sections = data.sections.filter((s) => s.items.length); paint();
    try { await api.delShop(it.id); } catch (e) { errToast(e); load(); }
  }
  async function clear() {
    data.sections.forEach((s) => (s.items = s.items.filter((x) => !x.checked))); data.sections = data.sections.filter((s) => s.items.length); paint();
    try { await api.clearChecked(planId); toast('Checked items cleared'); } catch (e) { errToast(e); load(); }
  }
}
