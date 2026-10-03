// Add / edit recipe: paste-a-link import (with fallbacks) plus a manual form.
import { api } from '../api.js';
import { h, icon, errToast, toast } from '../ui.js';
import { go } from '../router.js';
import { state } from '../state.js';

const UNITS = 'cups cup tbsp tablespoons tablespoon tsp teaspoons teaspoon oz ounces ounce lb lbs pound pounds g grams gram kg ml l liter liters clove cloves can cans pinch slice slices stick sticks bunch'.split(' ');
const VULG = { '¼': .25, '½': .5, '¾': .75, '⅓': .333, '⅔': .667, '⅛': .125 };
/** "1 1/2 cups flour" -> {raw, quantity:1.5, unit:'cups', name:'flour'} */
export function parseIngredient(raw) {
  const m = raw.match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+\s*[¼½¾⅓⅔⅛]?|[¼½¾⅓⅔⅛])\s*(.*)$/);
  let quantity = null, rest = raw.trim();
  if (m) {
    const t = m[1].trim(); rest = m[2];
    quantity = t.split(/\s+/).reduce((s, p) => s + (p.includes('/') ? p.split('/')[0] / p.split('/')[1] : VULG[p] ?? (parseFloat(p) || 0) + (VULG[p.slice(-1)] || 0)), 0);
  }
  const w = rest.split(/\s+/); let unit = null;
  if (quantity != null && UNITS.includes(w[0]?.toLowerCase().replace(/\.$/, ''))) unit = w.shift();
  return { raw: raw.trim(), quantity, unit, name: w.join(' ').replace(/^of\s+/, '') || raw.trim(), section: 'Other' };
}

export default async function add(root, { params, query }) {
  const editing = params.id ? await api.recipe(params.id).catch(errToast) : null;
  if (params.id && !editing) return go('/');
  const status = h('div');
  const urlIn = h('input', { type: 'url', inputMode: 'url', placeholder: 'Paste a recipe link…', autocapitalize: 'off', autocomplete: 'off', value: query.url || '' });
  const importBtn = h('button.btn.primary.big', { onclick: () => doImport({ url: urlIn.value.trim() }) }, icon('link'), 'Fetch recipe');

  const MSGS = ['Knocking on the website’s door…', 'Reading the recipe…', 'Sorting the ingredients into aisles…', 'Fetching a lovely photo…'];
  async function doImport(body) {
    if (!body.url && !body.text) return toast('Paste a link first 🙂');
    importBtn.disabled = true; let i = 0;
    const msg = h('p', MSGS[0]); status.replaceChildren(h('div.progress-msg', h('div.spinner'), msg));
    const timer = setInterval(() => { msg.textContent = MSGS[Math.min(++i, MSGS.length - 1)]; }, 1800);
    try {
      const r = await api.importRecipe(body); toast('Added to your book! 🎉'); go('/recipe/' + r.id);
    } catch (e) {
      status.replaceChildren(h('div.panel.stack', h('h3', e.code === 'scrape_failed' ? 'That site kept its recipe to itself' : 'Hmm, that didn’t work'), h('p.muted', e.detail),
        pasteBox(), h('button.btn.block', { onclick: () => { status.replaceChildren(); form.scrollIntoView({ behavior: 'smooth' }); } }, icon('edit'), 'Type it in by hand')));
    } finally { clearInterval(timer); importBtn.disabled = false; }
  }
  function pasteBox() {
    const ta = h('textarea', { placeholder: 'Paste the recipe text here — title on top, then "Ingredients" and "Instructions"…', rows: 6 });
    return h('div.stack', ta, h('button.btn.primary.block', { onclick: () => ta.value.trim() ? doImport({ text: ta.value, url: urlIn.value.trim() || undefined }) : toast('Paste some text first') }, 'Import from pasted text'));
  }

  // ---- manual form
  const r = editing || {};
  const f = {
    title: h('input', { type: 'text', value: r.title || '', required: true }),
    category: h('select', state.config.categories.map((c) => h('option', { value: c, selected: c === (r.category || 'dinner') }, c))),
    servings: h('input', { type: 'number', inputMode: 'numeric', min: 1, value: r.servings ?? '' }),
    prep: h('input', { type: 'number', inputMode: 'numeric', min: 0, value: r.prep_min ?? '' }),
    cook: h('input', { type: 'number', inputMode: 'numeric', min: 0, value: r.cook_min ?? '' }),
    desc: h('textarea', { rows: 2 }, r.description || ''),
    ings: h('textarea', { rows: 7, placeholder: '2 cups flour\n1 tsp salt\n3 cloves garlic' }, (r.ingredients || []).map((i) => i.raw || i.name).join('\n')),
    steps: h('textarea', { rows: 8, placeholder: 'One step per line' }, (r.steps || []).join('\n')),
    tags: h('input', { type: 'text', placeholder: 'italian, vegetarian, quick', value: (r.tags || []).join(', ') }),
    notes: h('textarea', { rows: 2 }, r.notes || ''),
  };
  const fld = (label, el) => h('label.field', h('span', label), el);
  const form = h('form.form', { onsubmit: save },
    h('h2', editing ? 'Edit recipe' : 'Or write it yourself'), fld('Title', f.title),
    h('div.two', fld('Category', f.category), fld('Servings', f.servings)), h('div.two', fld('Prep (min)', f.prep), fld('Cook (min)', f.cook)),
    fld('Description', f.desc), fld('Ingredients (one per line)', f.ings), fld('Steps (one per line)', f.steps), fld('Tags (comma separated)', f.tags), fld('Notes', f.notes),
    h('button.btn.primary.big.block', { type: 'submit' }, editing ? 'Save changes' : 'Save recipe'));
  async function save(e) {
    e.preventDefault(); if (!f.title.value.trim()) return toast('Give it a title first');
    const old = new Map((r.ingredients || []).map((i) => [i.raw || i.name, i]));
    const num = (el) => (el.value === '' ? null : Number(el.value));
    const prep = num(f.prep), cook = num(f.cook);
    const body = { ...r, title: f.title.value.trim(), category: f.category.value, servings: num(f.servings), prep_min: prep, cook_min: cook, total_min: prep != null || cook != null ? (prep || 0) + (cook || 0) : r.total_min ?? null,
      description: f.desc.value.trim(), notes: f.notes.value.trim(), tags: f.tags.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      ingredients: f.ings.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => old.get(l) || parseIngredient(l)),
      steps: f.steps.value.split('\n').map((l) => l.trim()).filter(Boolean) };
    try { const out = editing ? await api.updateRecipe(r.id, body) : await api.createRecipe(body); toast(editing ? 'Saved' : 'Recipe saved! 🍝'); go('/recipe/' + (out?.id || r.id)); } catch (er) { errToast(er); }
  }

  root.append(h('div.stack', editing ? h('a.btn.ghost', { href: '#/recipe/' + r.id }, icon('back'), 'Back') : [
    h('div.head', h('div', h('p.eyebrow', 'New recipe'), h('h1', 'What are we cooking?'), h('p.sub', 'Paste a link from almost any recipe site — we’ll do the typing.'))),
    h('div.linkbox', urlIn, importBtn, status)], h('div', { style: 'height:8px' }), form));
  urlIn.addEventListener('keydown', (e) => e.key === 'Enter' && importBtn.click());
  if (!editing && query.url && query.auto) setTimeout(() => doImport({ url: query.url }), 100);
}
