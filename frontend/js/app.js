// Boot: share-flow redirect, profile check, nav, routes, service worker.
import { route, render, go } from './router.js';
import { store } from './api.js';
import { h, icon, LOGO } from './ui.js';
import { state, loadConfig, refreshPlan, onPlanChange } from './state.js';
import recipes from './views/recipes.js';
import recipe from './views/recipe.js';
import add from './views/add.js';
import plan from './views/plan.js';
import shopping from './views/shopping.js';
import ideas from './views/ideas.js';
import settings from './views/settings.js';
import who from './views/who.js';

route('/', recipes, { tab: 'book' });
route('/recipe/:id', recipe, { tab: 'book' });
route('/add', add, { tab: 'book' });
route('/edit/:id', add, { tab: 'book' });
route('/plan', plan, { tab: 'plan' });
route('/shop', shopping, { tab: 'shop' });
route('/shop/:id', shopping, { tab: 'shop' });
route('/ideas', ideas, { tab: 'ideas' });
route('/settings', settings, { tab: 'me' });
route('/who', who, { bare: true, tab: '' });

const TABS = [['book', '/', 'book', 'Recipes'], ['plan', '/plan', 'calendar', 'Plan'], ['shop', '/shop', 'cart', 'Shop'], ['ideas', '/ideas', 'sparkle', 'Ideas'], ['me', '/settings', 'user', 'Me']];
function buildNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren(h('div.brand', { html: LOGO + '<span>Forkcast</span>' }),
    ...TABS.map(([id, path, ic, label]) => h('a', { href: '#' + path, 'data-tab': id }, icon(ic), h('span', label), id === 'plan' ? h('span.badge', { id: 'plan-badge', hidden: true }) : null)));
}
function markNav(tab) { document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab)); }
function updateBadge() { const b = document.getElementById('plan-badge'); if (!b) return; const n = state.plan?.items?.length || 0; b.hidden = !n; b.textContent = n; }

async function boot() {
  // Share flow: /?url=... (or ?text=...) -> #/add?url=...
  const sp = new URLSearchParams(location.search);
  const shared = sp.get('url') || (sp.get('text') || '').match(/https?:\/\/\S+/)?.[0];
  if (shared) { history.replaceState(null, '', location.pathname); location.hash = '#/add?url=' + encodeURIComponent(shared) + '&auto=1'; }
  buildNav();
  const root = document.getElementById('view');
  const run = async () => { if (!store.profile && !location.hash.startsWith('#/who')) { go('/who'); return; } markNav(await render(root)); };
  window.addEventListener('hashchange', run);
  onPlanChange(updateBadge);
  await loadConfig();
  await run();
  if (store.profile) refreshPlan();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
boot();
