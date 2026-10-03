// Hash router. Routes: '/recipe/:id' -> view(root, {params, query}). A view may return a cleanup function.
const routes = [];
let cleanup = null, token = 0;
export function route(pattern, view, opts = {}) {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ re, keys, view, opts });
}
export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/'; const [path, q = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(q)) };
}
export const go = (path) => { location.hash = '#' + path; };

export async function render(root) {
  const { path, query } = parseHash(); const my = ++token;
  for (const r of routes) {
    const m = path.match(r.re); if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    if (typeof cleanup === 'function') { try { cleanup(); } catch {} } cleanup = null;
    document.body.classList.toggle('no-nav', !!r.opts.bare);
    document.body.dataset.route = r.opts.tab || '';
    const page = document.createElement('div'); page.className = 'page';
    root.replaceChildren(page); window.scrollTo(0, 0);
    try { const c = await r.view(page, { params, query }); if (my === token) cleanup = c; else if (typeof c === 'function') c(); }
    catch (e) { page.textContent = ''; const p = document.createElement('p'); p.className = 'muted'; p.textContent = e.detail || e.message || 'Oops.'; page.append(p); console.error(e); }
    return r.opts.tab;
  }
  go('/'); return '';
}
