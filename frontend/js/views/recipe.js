// Recipe detail: hero, servings scaler, ingredient checklist, steps, cook mode (Wake Lock).
import { api } from '../api.js';
import { h, icon, recipeImg, fmtMins, fmtQty, errToast, toast, confirmSheet, skeleton } from '../ui.js';
import { go } from '../router.js';
import { planButton } from './recipes.js';

export default async function recipe(root, { params }) {
  root.append(h('div.skel', { style: 'aspect-ratio:16/10;border-radius:20px' }), ...skeleton(3, '', 'height:26px;margin-top:14px'));
  let r; try { r = await api.recipe(params.id); } catch (e) {
    root.replaceChildren(h('div.empty', h('div.big', '🫥'), h('h2', 'Recipe not found'), h('p', e.detail), h('a.btn', { href: '#/' }, 'Back to the book')));
    return;
  }
  const base = r.servings || 1; let want = base, wake = null, cooking = false;
  const ingList = h('ul.ing'), scaleLbl = h('b');
  const fav = h('button.icon-btn', { 'aria-label': 'Favorite', onclick: async () => {
    r.favorite = !r.favorite; paintFav();
    try { await api.updateRecipe(r.id, { ...r, favorite: r.favorite }); } catch (e) { r.favorite = !r.favorite; paintFav(); errToast(e); }
  } });
  const paintFav = () => { fav.classList.toggle('on', r.favorite); fav.replaceChildren(icon('heart', r.favorite)); };

  function paintIng() {
    const k = want / base; scaleLbl.textContent = `${want} serving${want === 1 ? '' : 's'}`;
    ingList.replaceChildren(...(r.ingredients || []).map((i) => {
      const scaled = i.quantity != null ? [fmtQty(i.quantity * k), i.unit, i.name].filter(Boolean) : null;
      const cb = h('input', { type: 'checkbox', onchange: () => li.classList.toggle('done', cb.checked) });
      const li = h('li', h('label', cb, h('span', scaled ? [h('b', scaled.slice(0, scaled.length - 1).join(' ')), ' ' + scaled[scaled.length - 1]] : i.raw || i.name)));
      return li;
    }));
  }
  const stepEls = [];
  const steps = h('ol.steps', (r.steps || []).map((s, i) => { const li = h('li', { onclick: () => cooking && mark(i) }, s); stepEls.push(li); return li; }));
  function mark(i) { stepEls.forEach((el, j) => el.classList.toggle('cur', j === i)); }

  const cookBtn = h('button.btn.primary', { onclick: toggleCook }, icon('flame'), 'Start cook mode');
  async function toggleCook() {
    cooking = !cooking; document.body.classList.toggle('cooking', cooking);
    cookBtn.replaceChildren(icon('flame'), cooking ? 'Stop cooking' : 'Start cook mode'); cookBtn.classList.toggle('primary', !cooking);
    if (cooking) {
      mark(0); steps.scrollIntoView({ behavior: 'smooth', block: 'start' });
      try { wake = await navigator.wakeLock?.request('screen'); toast('Screen will stay awake'); } catch {}
      if (!navigator.wakeLock) toast('Cook mode on (this browser cannot keep the screen awake)');
    } else { mark(-1); try { await wake?.release(); } catch {} wake = null; }
  }
  const onVis = async () => { if (cooking && document.visibilityState === 'visible') { try { wake = await navigator.wakeLock?.request('screen'); } catch {} } };
  document.addEventListener('visibilitychange', onVis);

  async function del() {
    if (!(await confirmSheet(`Delete "${r.title}"?`, 'It will be removed from your book and any plans.', 'Delete it', true))) return;
    try { await api.delRecipe(r.id); toast('Recipe deleted'); go('/'); } catch (e) { errToast(e); }
  }
  let host = ''; try { host = r.source_url ? new URL(r.source_url).hostname.replace(/^www\./, '') : ''; } catch {}

  root.replaceChildren(h('div.detail',
    h('div.hero', recipeImg(r, r.title), h('div.top', h('a.icon-btn', { href: '#/', 'aria-label': 'Back' }, icon('back')), fav)),
    h('div.stack', h('p.eyebrow', r.category), h('h1', r.title), r.description && h('p.muted', r.description),
      h('div.meta', r.prep_min != null && h('span', icon('clock'), 'Prep ' + fmtMins(r.prep_min)), r.cook_min != null && h('span', icon('flame'), 'Cook ' + fmtMins(r.cook_min)),
        r.total_min != null && h('span', icon('clock'), 'Total ' + fmtMins(r.total_min))),
      (r.tags || []).length ? h('div.row.wrap', r.tags.map((t) => h('span.pill', t))) : null,
      planButton(r), cookBtn,
      h('div.row.wrap', host && h('a.btn.ghost', { href: r.source_url, target: '_blank', rel: 'noopener' }, icon('link'), host),
        h('a.btn.ghost', { href: '#/edit/' + r.id }, icon('edit'), 'Edit'), h('button.btn.ghost.danger', { onclick: del }, icon('trash'), 'Delete')),
      r.notes && h('div.panel', h('p.eyebrow', 'Notes'), h('p', r.notes))),
    h('div.stack', h('div.panel', h('div.row', { style: 'justify-content:space-between;flex-wrap:wrap' }, h('h2', 'Ingredients'),
        h('div.scaler', h('button', { 'aria-label': 'Fewer servings', onclick: () => { want = Math.max(1, want - 1); paintIng(); } }, '−'), scaleLbl,
          h('button', { 'aria-label': 'More servings', onclick: () => { want += 1; paintIng(); } }, '+'))), ingList),
      h('div.panel', h('h2', 'Method'), steps))));
  paintFav(); paintIng();
  return () => { document.body.classList.remove('cooking'); document.removeEventListener('visibilitychange', onVis); try { wake?.release(); } catch {} };
}
