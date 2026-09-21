// Per-browser state (one laptop per team). Shared, cross-team state lives on the server (classroom.js).
const KEY = "fake-market-workshop-v2";

export function loadState() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export function saveState(patch) {
  const next = { ...loadState(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode etc. */ }
  return next;
}
export function resetState() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
export function markComplete(pageId) {
  const state = loadState();
  const done = new Set(state.completed || []);
  done.add(pageId);
  saveState({ completed: [...done] });
  document.dispatchEvent(new CustomEvent("fm:progress"));
}
export function isComplete(pageId) {
  return (loadState().completed || []).includes(pageId);
}
export function team() {
  const s = loadState();
  return { classCode: (s.classCode || "MESA").toUpperCase(), teamName: s.teamName || "", voterId: ensureVoterId() };
}
function ensureVoterId() {
  const s = loadState();
  if (s.voterId) return s.voterId;
  const id = (crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  saveState({ voterId: id });
  return id;
}
