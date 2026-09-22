// Client for the classroom API (votes, scores, leaderboard, instructor). Falls back gracefully offline.
import { team } from "./state.js";

export async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `요청 실패 (${response.status})`);
  return payload;
}

export const voteState = (activityId, classCode = team().classCode) =>
  api(`/api/vote/state?class_code=${encodeURIComponent(classCode)}&activity_id=${encodeURIComponent(activityId)}`);

export function submitVote(activityId, { choice, confidence, reason }) {
  const t = team();
  return api("/api/vote", { method: "POST", body: JSON.stringify({ classCode: t.classCode, activityId, voterId: t.voterId, teamName: t.teamName, choice, confidence, reason }) });
}

export function submitScore(activityId, value, detail = "") {
  const t = team();
  return api("/api/score", { method: "POST", body: JSON.stringify({ classCode: t.classCode, activityId, voterId: t.voterId, teamName: t.teamName, value, detail }) });
}

export function reportPresence(activityId) {
  const t = team();
  if (!t.teamName) return Promise.resolve({ ok: false });
  return api("/api/presence", { method: "POST", body: JSON.stringify({ classCode: t.classCode, voterId: t.voterId, teamName: t.teamName, activityId }) });
}

export const presentation = (classCode = team().classCode) =>
  api(`/api/presentation?class_code=${encodeURIComponent(classCode)}`);

export const leaderboard = (classCode = team().classCode) => api(`/api/leaderboard?class_code=${encodeURIComponent(classCode)}`);

export const instructor = {
  login: (password) => api("/api/instructor/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => api("/api/instructor/logout", { method: "POST" }),
  me: () => api("/api/instructor/me"),
  results: (classCode, activityId) => api(`/api/instructor/results?class_code=${encodeURIComponent(classCode)}&activity_id=${encodeURIComponent(activityId)}`),
  scores: (classCode) => api(`/api/instructor/scores?class_code=${encodeURIComponent(classCode)}`),
  presence: (classCode) => api(`/api/instructor/presence?class_code=${encodeURIComponent(classCode)}`),
  facilitation: (classCode) => api(`/api/instructor/facilitation?class_code=${encodeURIComponent(classCode)}`),
  setFacilitation: (payload) => api("/api/instructor/facilitation", { method: "POST", body: JSON.stringify(payload) }),
  state: (classCode, activityId, patch) => api("/api/instructor/state", { method: "POST", body: JSON.stringify({ classCode, activityId, ...patch }) }),
  reset: (classCode, activityId) => api("/api/instructor/reset", { method: "POST", body: JSON.stringify({ classCode, activityId }) }),
};

// Poll helper: calls fn immediately and then every `ms`; stops when the page is hidden.
export function poll(fn, ms = 3000) {
  let timer = null;
  const tick = async () => { try { await fn(); } catch { /* reported by caller */ } };
  const start = () => { tick(); timer = setInterval(tick, ms); };
  const stop = () => clearInterval(timer);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  start();
  return stop;
}
