// Thin fetch wrapper. Every call sends X-Profile-Id. Errors become ApiError {status, code, detail}.
export class ApiError extends Error {
  constructor(status, code, detail) { super(detail); this.status = status; this.code = code; this.detail = detail; }
}
export const store = {
  get profile() { try { return JSON.parse(localStorage.getItem('fc_profile')); } catch { return null; } },
  set profile(p) { try { p ? localStorage.setItem('fc_profile', JSON.stringify(p)) : localStorage.removeItem('fc_profile'); } catch {} },
};

async function req(method, path, body) {
  const headers = {};
  const p = store.profile; if (p) headers['X-Profile-Id'] = String(p.id);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try { res = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new ApiError(0, 'offline', "Can't reach the kitchen. Check your connection and try again."); }
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) throw new ApiError(res.status, data?.code || 'error', (typeof data?.detail === 'string' ? data.detail : null) || `Something went wrong (${res.status}).`);
  return data;
}
const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o || {})) if (v !== '' && v != null && v !== false) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };

export const api = {
  config: () => req('GET', '/config'), health: () => req('GET', '/health'),
  profiles: () => req('GET', '/profiles'), addProfile: (b) => req('POST', '/profiles', b), delProfile: (id) => req('DELETE', `/profiles/${id}`),
  recipes: (q) => req('GET', '/recipes' + qs(q)), recipe: (id) => req('GET', `/recipes/${id}`),
  createRecipe: (b) => req('POST', '/recipes', b), updateRecipe: (id, b) => req('PUT', `/recipes/${id}`, b), delRecipe: (id) => req('DELETE', `/recipes/${id}`),
  importRecipe: (b) => req('POST', '/recipes/import', b),
  plans: () => req('GET', '/plans'), currentPlan: () => req('GET', '/plans/current'), plan: (id) => req('GET', `/plans/${id}`),
  addToPlan: (b) => req('POST', '/plans/current/items', b), patchItem: (id, b) => req('PATCH', `/plans/items/${id}`, b), delItem: (id) => req('DELETE', `/plans/items/${id}`),
  savePlan: (name) => req('POST', '/plans/current/save', { name }), reusePlan: (id) => req('POST', `/plans/${id}/reuse`),
  renamePlan: (id, name) => req('PATCH', `/plans/${id}`, { name }), delPlan: (id) => req('DELETE', `/plans/${id}`),
  shopping: (id) => req('GET', `/plans/${id}/shopping`), patchShop: (id, b) => req('PATCH', `/shopping/items/${id}`, b),
  addShop: (planId, b) => req('POST', `/plans/${planId}/shopping/items`, b), delShop: (id) => req('DELETE', `/shopping/items/${id}`),
  clearChecked: (planId) => req('POST', `/plans/${planId}/shopping/clear-checked`),
  pantry: () => req('GET', '/pantry'), delPantry: (name) => req('DELETE', `/pantry/${encodeURIComponent(name)}`),
  suggestions: (kind) => req('GET', '/suggestions' + qs({ kind })),
};
