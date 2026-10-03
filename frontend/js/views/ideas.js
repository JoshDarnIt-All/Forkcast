// "Need ideas?" — AI suggestions by meal kind. Charming resting state when ai_enabled is false.
import { api } from '../api.js';
import { h, icon, recipeImg, fmtMins, errToast, toast, empty, skeleton } from '../ui.js';
import { state } from '../state.js';

let kind = 'dinner';
export default async function ideas(root) {
  const body = h('div'); const seg = h('div.seg');
  const paintSeg = () => seg.replaceChildren(...['breakfast', 'lunch', 'dinner', 'snack'].map((k) => h('button', { class: k === kind ? 'on' : '', onclick: () => { kind = k; paintSeg(); load(); } }, k)));
  root.append(h('div.head', h('div', h('p.eyebrow', 'Idea Kitchen'), h('h1', 'Need ideas?'), h('p.sub', 'Fresh inspiration, just for your table.'))), seg, h('div', { style: 'height:18px' }), body);
  paintSeg();

  async function load() {
    if (!state.config.ai_enabled) return body.replaceChildren(empty('😴', 'Idea Kitchen is resting', 'The recipe-dreaming assistant is switched off right now. To wake it up, set FORKCAST_AI_ENABLED=true on the server and point it at an AI provider (see the README). Until then, your recipe book is open as always.', h('a.btn.primary', { href: '#/add' }, 'Add a recipe instead')));
    body.replaceChildren(h('div.grid', skeleton(3, '', 'height:300px')));
    try {
      const res = await api.suggestions(kind);
      if (!res.enabled) { state.config.ai_enabled = false; return load(); }
      if (!res.items.length) return body.replaceChildren(empty('🤔', 'Nothing bubbled up', 'Try another meal, or check back in a moment.'));
      body.replaceChildren(h('div.grid', res.items.map(card)));
    } catch (e) { errToast(e); body.replaceChildren(empty('🌧️', 'The idea well ran dry', e.detail, h('button.btn', { onclick: load }, 'Try again'))); }
  }
  function card(s) {
    const btn = h('button.btn.primary', { onclick: async () => {
      btn.disabled = true;
      try { await api.createRecipe({ category: kind, ...s }); btn.replaceChildren(icon('check'), 'Saved'); toast('Saved to your book 📖'); } catch (e) { btn.disabled = false; errToast(e); }
    } }, icon('plus'), 'Save to my book');
    return h('article.card', h('div.ph', recipeImg(s)), h('div.body', h('h3', s.title), s.description && h('p.muted.small', s.description),
      h('div.meta', s.total_min ? h('span', icon('clock'), fmtMins(s.total_min)) : null, (s.ingredients || []).length ? h('span', (s.ingredients.length) + ' ingredients') : null), btn));
  }
  load();
}
