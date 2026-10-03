// Standalone dev server: serves ../ statically and mocks the Forkcast API (docs/API.md) in memory.
// Run: node frontend/dev/mock-api.mjs [port=8780]   (set MOCK_AI=1 to simulate ai_enabled)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'); const PORT = +process.argv[2] || 8780;
const SECTIONS = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Frozen', 'Pantry', 'Canned & Jarred', 'Spices & Baking', 'Beverages', 'Snacks', 'Household', 'Other'];
const CATS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink', 'other'];
const ing = (raw, quantity, unit, name, section) => ({ raw, quantity, unit, name, section });
const mk = (id, title, category, tags, servings, prep, cook, ingredients, steps, extra = {}) => ({ id, title, source_url: 'https://example.com/r/' + id, image_url: id % 4 === 0 ? null : `/media/m${id}.svg`, description: 'A reliable favorite with big flavor and little fuss.', servings, prep_min: prep, cook_min: cook, total_min: prep + cook, category, tags, favorite: id % 3 === 0, notes: '', added_by: 1, created_at: new Date(Date.now() - id * 864e5).toISOString(), ingredients, steps, ...extra });
let recipes = [
  mk(1, 'Lemon Garlic Roast Chicken', 'dinner', ['chicken', 'comfort'], 4, 15, 75, [ing('1 whole chicken', 1, null, 'whole chicken', 'Meat & Seafood'), ing('2 lemons', 2, null, 'lemons', 'Produce'), ing('6 cloves garlic', 6, 'cloves', 'garlic', 'Produce'), ing('2 tbsp butter', 2, 'tbsp', 'butter', 'Dairy & Eggs'), ing('1 tsp salt', 1, 'tsp', 'salt', 'Spices & Baking')], ['Heat the oven to 425°F and pat the chicken very dry.', 'Rub butter, salt and crushed garlic under and over the skin. Tuck lemon halves into the cavity.', 'Roast 70 to 80 minutes until the juices run clear. Rest 10 minutes before carving.']),
  mk(2, 'Creamy Tomato Basil Pasta', 'dinner', ['pasta', 'vegetarian', 'italian'], 4, 10, 20, [ing('12 oz pasta', 12, 'oz', 'pasta', 'Pantry'), ing('1 can crushed tomatoes', 1, 'can', 'crushed tomatoes', 'Canned & Jarred'), ing('1/2 cup heavy cream', .5, 'cup', 'heavy cream', 'Dairy & Eggs'), ing('1 bunch basil', 1, 'bunch', 'basil', 'Produce'), ing('3 cloves garlic', 3, 'cloves', 'garlic', 'Produce')], ['Boil the pasta in well-salted water.', 'Sauté garlic, add tomatoes and simmer 10 minutes.', 'Stir in cream and basil, toss with pasta.']),
  mk(3, 'Blueberry Buttermilk Pancakes', 'breakfast', ['sweet', 'quick'], 4, 10, 15, [ing('2 cups flour', 2, 'cups', 'flour', 'Spices & Baking'), ing('1 1/2 cups buttermilk', 1.5, 'cups', 'buttermilk', 'Dairy & Eggs'), ing('2 eggs', 2, null, 'eggs', 'Dairy & Eggs'), ing('1 cup blueberries', 1, 'cup', 'blueberries', 'Produce')], ['Whisk wet and dry separately, then fold together.', 'Cook on a buttered griddle until bubbles form, flip once.']),
  mk(4, 'Weeknight Veggie Stir-Fry', 'lunch', ['vegetarian', 'quick', 'asian'], 2, 15, 10, [ing('2 cups broccoli', 2, 'cups', 'broccoli', 'Produce'), ing('1 bell pepper', 1, null, 'bell pepper', 'Produce'), ing('3 tbsp soy sauce', 3, 'tbsp', 'soy sauce', 'Canned & Jarred'), ing('2 cloves garlic', 2, 'cloves', 'garlic', 'Produce')], ['Heat a wok until smoking.', 'Stir-fry vegetables 4 minutes, add sauce, serve over rice.']),
  mk(5, 'Chocolate Chip Skillet Cookie', 'dessert', ['sweet', 'baking'], 6, 10, 20, [ing('1/2 cup butter', .5, 'cup', 'butter', 'Dairy & Eggs'), ing('1 cup flour', 1, 'cup', 'flour', 'Spices & Baking'), ing('1 cup chocolate chips', 1, 'cup', 'chocolate chips', 'Spices & Baking')], ['Brown the butter, mix in the dry ingredients and chips.', 'Bake in a cast iron skillet at 350°F for 20 minutes.']),
  mk(6, 'Crunchy Chickpea Snack', 'snack', ['vegan', 'quick'], 4, 5, 25, [ing('1 can chickpeas', 1, 'can', 'chickpeas', 'Canned & Jarred'), ing('1 tbsp olive oil', 1, 'tbsp', 'olive oil', 'Pantry'), ing('1 tsp paprika', 1, 'tsp', 'paprika', 'Spices & Baking')], ['Dry the chickpeas well, toss with oil and paprika.', 'Roast at 400°F until crunchy.']),
];
let profiles = [{ id: 1, name: 'Josh', color: '#d4553a' }, { id: 2, name: 'Wife', color: '#7d9a78' }];
let nid = 100; const id = () => ++nid;
let plans = [{ id: 1, name: 'Next', status: 'draft', created_at: new Date().toISOString(), items: [] }];
plans.push({ id: 2, name: 'Cozy week in October', status: 'saved', created_at: new Date(Date.now() - 6e8).toISOString(), items: [{ id: 50, recipe_id: 2, day: 1, meal: 'dinner', servings_multiplier: 1 }] });
let shop = {}; let owned = new Set(['salt']);
const summary = (r) => r && { id: r.id, title: r.title, image_url: r.image_url, category: r.category };
const planOut = (p) => ({ ...p, item_count: p.items.length, items: p.items.map((i) => ({ ...i, recipe: summary(recipes.find((r) => r.id === i.recipe_id)) })) });
const draft = () => plans.find((p) => p.status === 'draft');
function genShop(p) {
  const old = shop[p.id] || []; const out = []; const by = new Map();
  for (const it of p.items) { const r = recipes.find((x) => x.id === it.recipe_id); if (!r) continue; const k = (it.servings_multiplier || 1) * (r.servings ? 1 : 1);
    for (const i of r.ingredients) { const key = i.name.toLowerCase() + '|' + (i.unit || ''); const e = by.get(key) || { id: 0, plan_id: p.id, name: i.name, quantity: null, unit: i.unit, section: i.section, checked: false, owned: owned.has(i.name.toLowerCase()), recipe_ids: [], custom: false };
      if (i.quantity != null) e.quantity = (e.quantity || 0) + i.quantity * k; if (!e.recipe_ids.includes(r.id)) e.recipe_ids.push(r.id); by.set(key, e); } }
  for (const e of by.values()) { const prev = old.find((o) => !o.custom && o.name === e.name && o.unit === e.unit); out.push(prev ? { ...e, id: prev.id, checked: prev.checked } : { ...e, id: id() }); }
  shop[p.id] = [...out, ...old.filter((o) => o.custom)];
}
const shopOut = (p) => { genShop(p); const items = shop[p.id]; return { plan_id: p.id, sections: SECTIONS.map((s) => ({ section: s, items: items.filter((i) => i.section === s) })).filter((s) => s.items.length) }; };
const svg = (n) => { const hues = [12, 30, 100, 18, 40, 140]; const h = hues[n % 6]; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 65% 62%)"/><stop offset="1" stop-color="hsl(${h + 30} 70% 78%)"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="200" cy="160" r="95" fill="#fffdf8" opacity=".9"/><circle cx="200" cy="160" r="70" fill="hsl(${h} 60% 55%)" opacity=".75"/><circle cx="170" cy="140" r="14" fill="hsl(${h + 60} 50% 45%)"/><circle cx="225" cy="175" r="18" fill="hsl(${h + 40} 60% 60%)"/><circle cx="215" cy="130" r="9" fill="#fffdf8"/></svg>`; };
const read = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } }); });
const err = (res, s, code, detail) => send(res, s, { code, detail });
const send = (res, s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname; const m = req.method;
  if (p.startsWith('/media/')) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return res.end(svg(parseInt(p.replace(/\D/g, '')) || 1)); }
  if (!p.startsWith('/api/')) {
    let f = path.join(ROOT, p === '/' ? 'index.html' : p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); return fs.createReadStream(f).pipe(res);
  }
  await new Promise((r) => setTimeout(r, 120)); const b = ['POST', 'PUT', 'PATCH'].includes(m) ? await read(req) : {}; let x;
  const a = p.slice(5).split('/'); const q = u.searchParams;
  try {
    if (p === '/api/health') return send(res, 200, { ok: true, version: 'mock' });
    if (p === '/api/config') return send(res, 200, { ai_enabled: !!process.env.MOCK_AI, sections: SECTIONS, categories: CATS });
    if (p === '/api/profiles') { if (m === 'POST') { const n = { id: id(), ...b }; profiles.push(n); return send(res, 201, n); } return send(res, 200, profiles); }
    if (a[0] === 'profiles' && m === 'DELETE') { profiles = profiles.filter((q) => q.id != a[1]); return send(res, 200, { ok: true }); }
    if (p === '/api/recipes/import') {
      if (b.url && /fail/.test(b.url)) return err(res, 422, 'scrape_failed', "We couldn't read that page. Try pasting the recipe text instead.");
      await new Promise((r) => setTimeout(r, 1500)); const n = mk(id(), b.text ? b.text.split('\n')[0] : 'Imported Skillet Gnocchi', 'dinner', ['quick'], 4, 10, 15, [ing('1 lb gnocchi', 1, 'lb', 'gnocchi', 'Pantry')], ['Brown the gnocchi.', 'Add sauce.']); recipes.unshift(n); return send(res, 201, n);
    }
    if (a[0] === 'recipes') {
      if (!a[1]) {
        if (m === 'POST') { const n = { ...b, id: id(), favorite: false, created_at: new Date().toISOString(), image_url: b.image_url || null }; recipes.unshift(n); return send(res, 201, n); }
        const s = (q.get('q') || '').toLowerCase();
        let l = recipes.filter((r) => (!s || (r.title + r.ingredients.map((i) => i.name)).toLowerCase().includes(s)) && (!q.get('category') || r.category === q.get('category')) && (!q.get('tag') || r.tags.includes(q.get('tag'))) && (q.get('favorite') !== 'true' || r.favorite));
        return send(res, 200, l.map(({ steps, ingredients, ...r }) => r));
      }
      const r = recipes.find((r) => r.id == a[1]); if (!r) return err(res, 404, 'not_found', 'No such recipe.');
      if (m === 'PUT') { Object.assign(r, b, { id: r.id }); } if (m === 'DELETE') { recipes = recipes.filter((q) => q !== r); return send(res, 200, { ok: true }); } return send(res, 200, r);
    }
    if (a[0] === 'plans') {
      if (!a[1]) return send(res, 200, plans.filter((q) => q.status === 'saved').map(planOut));
      if (a[1] === 'current') {
        if (a[2] === 'items') { const d = draft(); x = d.items.find((i) => i.recipe_id === b.recipe_id && i.day === (b.day ?? null) && i.meal === (b.meal ?? null)); if (!x) { x = { id: id(), recipe_id: b.recipe_id, day: b.day ?? null, meal: b.meal ?? null, servings_multiplier: 1 }; d.items.push(x); } return send(res, 201, planOut(d)); }
        if (a[2] === 'save') { const d = draft(); d.status = 'saved'; d.name = b.name; plans.push({ id: id(), name: 'Next', status: 'draft', created_at: new Date().toISOString(), items: [] }); return send(res, 200, planOut(d)); }
        return send(res, 200, planOut(draft()));
      }
      if (a[1] === 'items') { const d = plans.flatMap((q) => q.items); x = d.find((i) => i.id == a[2]); if (m === 'DELETE') { plans.forEach((q) => (q.items = q.items.filter((i) => i !== x))); return send(res, 200, { ok: true }); } Object.assign(x, b); return send(res, 200, x); }
      const pl = plans.find((q) => q.id == a[1]); if (!pl) return err(res, 404, 'not_found', 'No such plan.');
      if (a[2] === 'reuse') { const d = draft(); d.items = pl.items.map((i) => ({ ...i, id: id() })); return send(res, 200, planOut(d)); }
      if (a[2] === 'shopping') {
        if (a[3] === 'clear-checked') { shop[pl.id] = shop[pl.id].filter((i) => !i.checked); return send(res, 200, { ok: true }); }
        if (a[3] === 'items') { shop[pl.id] = shop[pl.id] || []; const n = { id: id(), plan_id: pl.id, quantity: null, unit: null, section: 'Other', checked: false, owned: false, recipe_ids: [], custom: true, ...b }; shop[pl.id].push(n); return send(res, 201, n); }
        return send(res, 200, shopOut(pl));
      }
      if (m === 'DELETE') { plans = plans.filter((q) => q !== pl); return send(res, 200, { ok: true }); } if (m === 'PATCH') Object.assign(pl, b); return send(res, 200, planOut(pl));
    }
    if (a[0] === 'shopping') { const all = Object.values(shop).flat(); x = all.find((i) => i.id == a[2]); if (!x) return err(res, 404, 'not_found', 'No such item.'); if (m === 'DELETE') { for (const k in shop) shop[k] = shop[k].filter((i) => i !== x); return send(res, 200, { ok: true }); } Object.assign(x, b); if ('owned' in b) b.owned ? owned.add(x.name.toLowerCase()) : owned.delete(x.name.toLowerCase()); return send(res, 200, x); }
    if (a[0] === 'pantry') { if (m === 'DELETE') owned.delete(decodeURIComponent(a[1])); return send(res, 200, [...owned]); }
    if (a[0] === 'suggestions') { if (!process.env.MOCK_AI) return send(res, 200, { enabled: false, items: [] }); const k = q.get('kind'); return send(res, 200, { enabled: true, items: [1, 2, 3].map((n) => ({ title: `${k} idea #${n}: Honey Lime ${['Salmon', 'Tacos', 'Bites'][n - 1]}`, description: 'Bright, sticky and ready in minutes.', total_min: 20 + n * 5, servings: 2, ingredients: [ing('1 lime', 1, null, 'lime', 'Produce')], steps: ['Mix.', 'Cook.'], tags: [k], image_url: `/media/m${n}.svg` })) }); }
    err(res, 404, 'not_found', 'Unknown endpoint');
  } catch (e) { console.error(e); err(res, 500, 'mock_error', String(e)); }
}).listen(PORT, () => console.log(`Forkcast mock on http://localhost:${PORT}`));
