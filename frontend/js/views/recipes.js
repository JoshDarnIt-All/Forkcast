// Recipe Book: search, category chips, favorites, tag filter, pull-to-refresh, photo cards.
import { api, store } from '../api.js';
import { h, icon, recipeImg, fmtMins, skeleton, debounce, empty, errToast, greeting } from '../ui.js';
import { state, inPlan, togglePlan, onPlanChange } from '../state.js';
import { go } from '../router.js';

let filters = { q: '', category: '', tag: '', favorite: false };   // remembered while the app is open

export function planButton(recipe) {
  const b = h('button.btn.sage');
  const paint = () => { const on = inPlan(recipe.id); b.replaceChildren(icon(on ? 'check' : 'plus'), on ? 'In next meal plan' : 'Add to next meal plan'); b.classList.toggle('primary', on); b.classList.toggle('sage', !on); b.setAttribute('aria-pressed', on); };
  b.onclick = async (e) => { e.preventDefault(); b.disabled = true; b.disabled = false; togglePlan(recipe); };
  paint(); b.paint = paint; return b;
}

export default async function recipes(root) {
  const grid = h('div.grid', skeleton(6, '', 'height:330px;border-radius:20px'));
  const tagRow = h('div.chips', { hidden: true }); const catRow = h('div.chips');
  const ptr = h('div.ptr', 'Pull down to refresh');
  const search = h('input', { type: 'search', placeholder: 'Search recipes, ingredients…', value: filters.q, 'aria-label': 'Search recipes' });
  const favChip = h('button.chip', { onclick: () => { filters.favorite = !filters.favorite; paintChips(); load(); } }, '♥ Favorites');
  let list = [], allTags = [], cards = [];

  function paintChips() {
    favChip.classList.toggle('on', filters.favorite);
    catRow.replaceChildren(favChip, ...['', ...state.config.categories].map((c) =>
      h('button.chip', { class: filters.category === c ? 'on' : '', onclick: () => { filters.category = c; paintChips(); load(); } }, c || 'All')));
    tagRow.hidden = !allTags.length;
    tagRow.replaceChildren(...allTags.map((t) => h('button.chip.tag', { class: filters.tag === t ? 'on' : '', onclick: () => { filters.tag = filters.tag === t ? '' : t; paintChips(); load(); } }, '#' + t)));
  }
  function card(r, i) {
    const fav = h('button.icon-btn.fav', { 'aria-label': 'Favorite', class: r.favorite ? 'on' : '', onclick: async (e) => {
      e.preventDefault(); r.favorite = !r.favorite; fav.classList.toggle('on', r.favorite); fav.replaceChildren(icon('heart', r.favorite));
      try { const full = await api.recipe(r.id); await api.updateRecipe(r.id, { ...full, favorite: r.favorite }); } catch (er) { r.favorite = !r.favorite; fav.classList.toggle('on', r.favorite); fav.replaceChildren(icon('heart', r.favorite)); errToast(er); }
    } }, icon('heart', r.favorite));
    const pb = planButton(r); cards.push(pb);
    return h('article.card', { style: `animation-delay:${Math.min(i, 8) * 40}ms` },
      h('a.ph', { href: '#/recipe/' + r.id, 'aria-label': r.title }, recipeImg(r), h('span.cat', r.category || 'recipe'), fav),
      h('div.body', h('h3', h('a', { href: '#/recipe/' + r.id }, r.title)),
        h('div.meta', r.total_min ? h('span', icon('clock'), fmtMins(r.total_min)) : null, r.servings ? h('span', icon('users'), 'Serves ' + r.servings) : null),
        pb));
  }
  async function load() {
    try {
      list = await api.recipes({ q: filters.q, category: filters.category, tag: filters.tag, favorite: filters.favorite, sort: 'recent' });
      if (!filters.tag && !filters.q && !filters.category && !filters.favorite) { const c = {}; list.forEach((r) => (r.tags || []).forEach((t) => (c[t] = (c[t] || 0) + 1))); allTags = Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 14); paintChips(); }
      cards = [];
      grid.replaceChildren(...(list.length ? list.map(card) : [empty('🍳', filters.q || filters.tag || filters.category || filters.favorite ? 'Nothing matches that' : 'The book is empty',
        filters.q || filters.tag || filters.category || filters.favorite ? 'Try loosening a filter — good food is hiding somewhere.' : 'Paste a link to your first recipe and dinner forecasting begins.',
        h('a.btn.primary', { href: '#/add' }, icon('plus'), 'Add a recipe'))]));
      grid.classList.toggle('grid', !!list.length);
    } catch (e) { errToast(e); grid.replaceChildren(empty('🌧️', 'Forecast unavailable', e.detail, h('button.btn', { onclick: load }, 'Try again'))); }
  }

  root.append(h('div.head', h('div', h('p.eyebrow', 'Forkcast'), h('h1', greeting(store.profile?.name)), h('p.sub', 'What does your dinner forecast look like?')),
    h('a.btn.primary.big', { href: '#/add' }, icon('plus'), 'Add recipe')),
    ptr, h('div.stack', h('div.search', icon('search'), search), catRow, tagRow, grid));
  paintChips();
  search.addEventListener('input', debounce(() => { filters.q = search.value.trim(); load(); }, 300));
  const off = onPlanChange(() => cards.forEach((c) => c.paint()));

  // pull-to-refresh
  let y0 = null, dy = 0;
  const ts = (e) => { y0 = window.scrollY <= 0 ? e.touches[0].clientY : null; dy = 0; };
  const tm = (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 0) { ptr.style.height = Math.min(dy / 2, 60) + 'px'; ptr.textContent = dy > 120 ? 'Release to refresh' : 'Pull down to refresh'; } };
  const te = async () => { if (y0 != null && dy > 120) { ptr.textContent = 'Stirring…'; await load(); } ptr.style.height = 0; y0 = null; };
  document.addEventListener('touchstart', ts, { passive: true }); document.addEventListener('touchmove', tm, { passive: true }); document.addEventListener('touchend', te);
  await load();
  return () => { off(); document.removeEventListener('touchstart', ts); document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', te); };
}
