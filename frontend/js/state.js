// Shared app state: config + the current draft plan (so recipe cards know what's "in the plan").
import { api } from './api.js';
import { toast, errToast } from './ui.js';

export const state = { config: { ai_enabled: false, sections: [], categories: ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink', 'other'] }, plan: null };
const listeners = new Set();
export const onPlanChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((f) => f(state.plan));

export async function loadConfig() { try { state.config = { ...state.config, ...(await api.config()) }; } catch (e) { errToast(e); } }
export async function refreshPlan() { try { state.plan = await api.currentPlan(); emit(); } catch (e) { errToast(e); } return state.plan; }
export const planItemsFor = (rid) => (state.plan?.items || []).filter((i) => i.recipe_id === rid);
export const inPlan = (rid) => planItemsFor(rid).length > 0;

/** Optimistic toggle of "next meal plan" membership. Returns new in-plan state. */
export async function togglePlan(recipe) {
  const items = state.plan?.items || (state.plan = { items: [] }).items;
  const was = planItemsFor(recipe.id);
  const snapshot = [...items];
  try {
    if (was.length) {
      state.plan.items = items.filter((i) => i.recipe_id !== recipe.id); emit();
      await Promise.all(was.filter((i) => i.id > 0).map((i) => api.delItem(i.id)));
      toast('Taken off the plan');
    } else {
      items.push({ id: -1, recipe_id: recipe.id, recipe, day: null, meal: null, servings_multiplier: 1 }); emit();
      await api.addToPlan({ recipe_id: recipe.id });
      toast('On the plan! 🍽️');
    }
    await refreshPlan();
  } catch (e) { state.plan.items = snapshot; emit(); errToast(e); }
  return inPlan(recipe.id);
}
