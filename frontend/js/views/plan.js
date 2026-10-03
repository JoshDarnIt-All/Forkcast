// Meal plan: current draft grouped by day/meal (+ Unscheduled bucket) and saved plans.
import { api } from '../api.js';
import { h, icon, recipeImg, errToast, toast, sheet, promptSheet, confirmSheet, empty, DAYS, MEALS, skeleton } from '../ui.js';
import { state, refreshPlan } from '../state.js';
import { go } from '../router.js';

let tab = 'next';
const mealRank = (m) => (m ? MEALS.indexOf(m) : 9);

export default async function plan(root) {
  const body = h('div');
  const seg = h('div.seg', { role: 'tablist' });
  const paintSeg = () => seg.replaceChildren(...[['next', 'Next plan'], ['saved', 'Saved plans']].map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; paintSeg(); show(); } }, l)));
  root.append(h('div.head', h('div', h('p.eyebrow', 'The week ahead'), h('h1', 'Meal plan'))), seg, h('div', { style: 'height:18px' }), body);
  paintSeg(); show();

  async function show() { body.replaceChildren(...skeleton(3, '', 'height:80px;margin-bottom:10px')); tab === 'next' ? await showNext() : await showSaved(); }

  async function showNext() {
    const p = await refreshPlan(); if (!p) return body.replaceChildren(empty('🌧️', 'Could not load the plan', '', h('button.btn', { onclick: show }, 'Retry')));
    const items = p.items || [];
    if (!items.length) return body.replaceChildren(empty('🗓️', 'A blank week — full of possibility', 'Tap “Add to next meal plan” on any recipe and it lands here, ready to be sorted into days.', h('a.btn.primary', { href: '#/' }, 'Browse recipes')));
    const sorted = [...items].sort((a, b) => (a.day ?? 9) - (b.day ?? 9) || mealRank(a.meal) - mealRank(b.meal));
    const groups = new Map(); sorted.forEach((i) => { const k = i.day ?? 'u'; groups.set(k, [...(groups.get(k) || []), i]); });
    const order = ['u', 0, 1, 2, 3, 4, 5, 6].filter((k) => groups.has(k));
    body.replaceChildren(
      h('div.row.wrap', { style: 'margin-bottom:18px' }, h('button.btn.primary', { onclick: save }, icon('check'), 'Save plan'), h('a.btn.sage', { href: '#/shop/' + p.id }, icon('cart'), 'Shopping list')),
      ...order.map((k) => h('section.bucket', { class: k === 'u' ? 'unsched' : '' },
        h('h3', k === 'u' ? 'Unscheduled' : DAYS[k], h('small', k === 'u' ? 'tap Move to pick a day' : groups.get(k).length + ' meal' + (groups.get(k).length > 1 ? 's' : ''))),
        groups.get(k).map(row))));
  }
  function row(it) {
    const mult = it.servings_multiplier || 1;
    const mx = h('span', { title: 'servings multiplier' }, mult + '×');
    const bump = async (d) => {
      const m = Math.max(0.5, Math.round((it.servings_multiplier + d) * 2) / 2); if (m === it.servings_multiplier) return;
      const old = it.servings_multiplier; it.servings_multiplier = m; mx.textContent = m + '×';
      try { await api.patchItem(it.id, { servings_multiplier: m }); } catch (e) { it.servings_multiplier = old; mx.textContent = old + '×'; errToast(e); }
    };
    return h('div.item', h('div.th', recipeImg(it.recipe)),
      h('div.grow', h('a.t', { href: '#/recipe/' + it.recipe_id }, it.recipe?.title || 'Recipe'), it.meal ? h('span.pill', it.meal) : null,
        h('div.mini', h('button', { 'aria-label': 'Less', onclick: () => bump(-0.5) }, '−'), mx, h('button', { 'aria-label': 'More', onclick: () => bump(0.5) }, '+'))),
      h('button.icon-btn', { 'aria-label': 'Move', onclick: () => move(it) }, icon('move')),
      h('button.icon-btn', { 'aria-label': 'Remove', onclick: async () => { try { await api.delItem(it.id); toast('Removed'); show(); } catch (e) { errToast(e); } } }, icon('x')));
  }
  function move(it) {
    let day = it.day, meal = it.meal;
    const dayRow = h('div.chips', { style: 'flex-wrap:wrap;overflow:visible;margin:0;padding:0' }), mealRow = h('div.chips', { style: 'flex-wrap:wrap;overflow:visible;margin:0;padding:0' });
    const paint = () => {
      dayRow.replaceChildren(h('button.chip', { class: day == null ? 'on' : '', onclick: () => { day = null; paint(); } }, 'Unscheduled'), ...DAYS.map((d, i) => h('button.chip', { class: day === i ? 'on' : '', onclick: () => { day = i; paint(); } }, d.slice(0, 3))));
      mealRow.replaceChildren(...MEALS.map((m) => h('button.chip', { class: meal === m ? 'on' : '', onclick: () => { meal = meal === m ? null : m; paint(); } }, m)));
    };
    paint();
    const s = sheet(h('h2', 'Move ' + (it.recipe?.title || 'meal')), h('p.eyebrow', 'Which day?'), dayRow, h('p.eyebrow', 'Which meal?'), mealRow,
      h('button.btn.primary.block.big', { onclick: async () => { try { await api.patchItem(it.id, { day, meal }); s.close(); show(); } catch (e) { errToast(e); } } }, 'Move it'));
  }
  async function save() {
    const name = await promptSheet('Name this plan', 'Week of ' + new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), 'Save plan'); if (!name) return;
    try { await api.savePlan(name); toast('Plan saved 📌'); await refreshPlan(); tab = 'saved'; paintSeg(); show(); } catch (e) { errToast(e); }
  }
  async function showSaved() {
    let plans; try { plans = await api.plans(); } catch (e) { errToast(e); return body.replaceChildren(empty('🌧️', 'Could not load plans', e.detail)); }
    if (!plans.length) return body.replaceChildren(empty('📌', 'No saved plans yet', 'Save a plan you loved and reuse it any week.'));
    body.replaceChildren(...plans.map((p) => h('div.saved', h('div', h('h3', p.name), h('p.muted.small', `${p.item_count ?? p.items?.length ?? 0} meals · ${new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`)),
      h('div.row.wrap', h('button.btn.primary', { onclick: async () => {
        if ((state.plan?.items || []).length && !(await confirmSheet('Replace your next plan?', 'Its current meals will be swapped for this plan’s.', 'Use again'))) return;
        try { await api.reusePlan(p.id); toast('Plan is ready to go'); tab = 'next'; paintSeg(); show(); } catch (e) { errToast(e); } } }, 'Use again'),
        h('a.btn', { href: '#/shop/' + p.id }, icon('cart'), 'List'),
        h('button.icon-btn', { 'aria-label': 'Delete plan', onclick: async () => { if (await confirmSheet(`Delete "${p.name}"?`, '', 'Delete', true)) { try { await api.delPlan(p.id); show(); } catch (e) { errToast(e); } } } }, icon('trash'))))));
  }
}
