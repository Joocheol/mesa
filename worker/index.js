// Classroom API + static asset server (Cloudflare-Workers-style fetch handler, D1 database).
// Secrets (never in the repo): INSTRUCTOR_PASSWORD_HASH (sha256 hex of the password),
// SESSION_SIGNING_SECRET (random string). Binding: DB (D1).
const ASSETS = __ASSET_MAP__;

const ACTIVITIES = new Set(["round1", "round2", "round3"]);
const SCORE_ACTIVITIES = new Set(["repair", "abm"]);
const CHOICES = new Set(["A", "B", "C"]);
const encoder = new TextEncoder();
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SECURITY_HEADERS, ...headers } });
const safe = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const classOf = (value) => safe(value, 12).toUpperCase().replace(/[^A-Z0-9-]/g, "");

async function sha256(value) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function verifyHmac(value, signature, secret) {
  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const normalized = signature.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(value));
  } catch { return false; }
}
function cookies(request) {
  return Object.fromEntries((request.headers.get("cookie") || "").split(";").map((x) => x.trim().split("=")).filter((x) => x.length === 2));
}
async function isInstructor(request, env) {
  const token = cookies(request).fm_instructor;
  if (!token || !env.SESSION_SIGNING_SECRET) return false;
  const [expires, signature] = token.split(".");
  if (!expires || Number(expires) < Date.now()) return false;
  return verifyHmac(expires, signature, env.SESSION_SIGNING_SECRET);
}
async function body(request) {
  try { return await request.json(); } catch { return {}; }
}
const now = () => new Date().toISOString();
const classAllowed = (env, classCode) => !env.CLASS_CODE || classCode === classOf(env.CLASS_CODE);
const classError = () => json({ error: "등록되지 않은 수업 코드입니다." }, 403);
const clientKey = (request) => safe(request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown", 80);

async function loginRateLimited(request, env) {
  const key = clientKey(request);
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await env.DB.prepare("DELETE FROM classroom_auth_attempts WHERE attempted_at < ?").bind(cutoff).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM classroom_auth_attempts WHERE client_key = ?").bind(key).first();
  return Number(row?.count || 0) >= 10;
}

async function recordFailedLogin(request, env) {
  await env.DB.prepare("INSERT INTO classroom_auth_attempts (client_key, attempted_at) VALUES (?, ?)").bind(clientKey(request), now()).run();
}

async function clearFailedLogins(request, env) {
  await env.DB.prepare("DELETE FROM classroom_auth_attempts WHERE client_key = ?").bind(clientKey(request)).run();
}

// Round 3 is held back for classroom pacing: it starts closed and the instructor opens it on the day.
const defaultOpen = (activityId) => (activityId === "round3" ? 0 : 1);

async function ensureState(db, classCode, activityId) {
  await db.prepare("INSERT INTO classroom_activity_state (class_code, activity_id, open, revealed, updated_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT(class_code, activity_id) DO NOTHING").bind(classCode, activityId, defaultOpen(activityId), now()).run();
  return db.prepare("SELECT open, revealed, correct_choice FROM classroom_activity_state WHERE class_code = ? AND activity_id = ?").bind(classCode, activityId).first();
}

async function publicState(env, classCode, activityId) {
  const state = await ensureState(env.DB, classCode, activityId);
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM classroom_votes WHERE class_code = ? AND activity_id = ?").bind(classCode, activityId).first();
  const result = { activityId, open: Boolean(state.open), revealed: Boolean(state.revealed), submissionCount: Number(count.count) };
  if (state.revealed) {
    const rows = await env.DB.prepare("SELECT choice, COUNT(*) AS count FROM classroom_votes WHERE class_code = ? AND activity_id = ? GROUP BY choice").bind(classCode, activityId).all();
    result.counts = Object.fromEntries(rows.results.map((x) => [x.choice, Number(x.count)]));
    result.correctChoice = state.correct_choice;
  }
  return result;
}

const mime = (path) =>
  path.endsWith(".html") ? "text/html; charset=utf-8"
    : path.endsWith(".js") ? "text/javascript; charset=utf-8"
    : path.endsWith(".css") ? "text/css; charset=utf-8"
    : path.endsWith(".json") ? "application/json; charset=utf-8"
    : path.endsWith(".csv") ? "text/csv; charset=utf-8"
    : path.endsWith(".svg") ? "image/svg+xml"
    : path.endsWith(".md") ? "text/markdown; charset=utf-8"
    : "application/octet-stream";

function asset(pathname) {
  const path = pathname === "/" ? "/index.html" : pathname;
  const encoded = ASSETS[path];
  if (!encoded) return null;
  const raw = atob(encoded);
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const cache = path.endsWith(".html") || path.endsWith(".js") || path.endsWith(".css") ? "no-cache" : "public, max-age=3600";
  return new Response(bytes, { headers: { "content-type": mime(path), "cache-control": cache, ...SECURITY_HEADERS } });
}

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/")) return null;

  if (path === "/api/instructor/login" && request.method === "POST") {
    const data = await body(request);
    const expected = env.INSTRUCTOR_PASSWORD_HASH || "";
    if (!expected || !env.SESSION_SIGNING_SECRET) return json({ error: "서버에 강사 비밀번호가 설정되지 않았습니다." }, 503);
    if (await loginRateLimited(request, env)) return json({ error: "로그인 시도가 너무 많습니다. 15분 뒤 다시 시도하세요." }, 429);
    if ((await sha256(String(data.password || ""))) !== expected) {
      await recordFailedLogin(request, env);
      return json({ error: "강사 비밀번호가 올바르지 않습니다." }, 403);
    }
    await clearFailedLogins(request, env);
    const expires = String(Date.now() + 8 * 60 * 60 * 1000);
    const token = `${expires}.${await hmac(expires, env.SESSION_SIGNING_SECRET)}`;
    const secure = url.protocol === "https:" ? "; Secure" : "";
    return json({ ok: true }, 200, { "set-cookie": `fm_instructor=${token}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=28800` });
  }
  if (path === "/api/instructor/logout" && request.method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": "fm_instructor=; Path=/; Max-Age=0" });
  }

  if (path === "/api/vote/state" && request.method === "GET") {
    const classCode = classOf(url.searchParams.get("class_code"));
    const activityId = safe(url.searchParams.get("activity_id"), 40);
    if (!classCode || !ACTIVITIES.has(activityId)) return json({ error: "수업 코드와 활동이 필요합니다." }, 400);
    if (!classAllowed(env, classCode)) return classError();
    return json(await publicState(env, classCode, activityId));
  }

  if (path === "/api/vote" && request.method === "POST") {
    const data = await body(request);
    const classCode = classOf(data.classCode);
    const activityId = safe(data.activityId, 40);
    const voterId = safe(data.voterId, 80);
    const teamName = safe(data.teamName, 40);
    const choice = safe(data.choice, 8);
    const reason = safe(data.reason, 500);
    const confidence = Number(data.confidence);
    if (!classCode || !ACTIVITIES.has(activityId) || !voterId || !teamName || !CHOICES.has(choice) || !Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
      return json({ error: "투표 입력값을 확인하세요." }, 400);
    }
    if (!classAllowed(env, classCode)) return classError();
    const state = await ensureState(env.DB, classCode, activityId);
    if (!state.open) return json({ error: "강사가 이 라운드를 마감했습니다." }, 409);
    if (state.revealed) return json({ error: "정답이 공개된 라운드에는 제출할 수 없습니다." }, 409);
    await env.DB.prepare("INSERT INTO classroom_votes (class_code, activity_id, voter_id, team_name, choice, confidence, reason, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(class_code, activity_id, voter_id) DO UPDATE SET team_name=excluded.team_name, choice=excluded.choice, confidence=excluded.confidence, reason=excluded.reason, updated_at=excluded.updated_at")
      .bind(classCode, activityId, voterId, teamName, choice, confidence, reason, now()).run();
    return json({ ok: true });
  }

  if (path === "/api/score" && request.method === "POST") {
    const data = await body(request);
    const classCode = classOf(data.classCode);
    const activityId = safe(data.activityId, 40);
    const voterId = safe(data.voterId, 80);
    const teamName = safe(data.teamName, 40);
    const value = Number(data.value);
    const detail = safe(data.detail, 500);
    if (!classCode || !SCORE_ACTIVITIES.has(activityId) || !voterId || !teamName || !Number.isInteger(value) || value < 0 || value > 5) return json({ error: "진단값 입력을 확인하세요." }, 400);
    if (!classAllowed(env, classCode)) return classError();
    await env.DB.prepare("INSERT INTO classroom_scores (class_code, activity_id, voter_id, team_name, value, detail, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(class_code, activity_id, voter_id) DO UPDATE SET team_name=excluded.team_name, value=excluded.value, detail=excluded.detail, updated_at=excluded.updated_at")
      .bind(classCode, activityId, voterId, teamName, value, detail, now()).run();
    return json({ ok: true });
  }

  if (path === "/api/leaderboard" && request.method === "GET") {
    const classCode = classOf(url.searchParams.get("class_code"));
    if (!classCode) return json({ error: "수업 코드가 필요합니다." }, 400);
    if (!classAllowed(env, classCode)) return classError();
    const activities = {};
    for (const id of ACTIVITIES) {
      const s = await ensureState(env.DB, classCode, id);
      activities[id] = { open: Boolean(s.open), revealed: Boolean(s.revealed), correctChoice: s.revealed ? s.correct_choice : null };
    }
    const revealed = Object.entries(activities).filter(([, s]) => s.revealed).map(([id]) => id);
    let votes = [];
    if (revealed.length) {
      const placeholders = revealed.map(() => "?").join(",");
      const rows = await env.DB.prepare(`SELECT activity_id, team_name, choice, confidence FROM classroom_votes WHERE class_code = ? AND activity_id IN (${placeholders})`).bind(classCode, ...revealed).all();
      votes = rows.results;
    }
    const scores = await env.DB.prepare("SELECT activity_id, team_name, value, detail FROM classroom_scores WHERE class_code = ?").bind(classCode).all();
    const counts = await env.DB.prepare("SELECT activity_id, COUNT(*) AS count FROM classroom_votes WHERE class_code = ? GROUP BY activity_id").bind(classCode).all();
    return json({ classCode, activities, votes, scores: scores.results, submissionCounts: Object.fromEntries(counts.results.map((x) => [x.activity_id, Number(x.count)])) });
  }

  if (path === "/api/instructor/me") return json({ ok: await isInstructor(request, env) });
  if (path.startsWith("/api/instructor/")) {
    if (!(await isInstructor(request, env))) return json({ error: "강사 로그인이 필요합니다." }, 401);
    if (path === "/api/instructor/results" && request.method === "GET") {
      const classCode = classOf(url.searchParams.get("class_code"));
      const activityId = safe(url.searchParams.get("activity_id"), 40);
      if (!classCode || !ACTIVITIES.has(activityId)) return json({ error: "수업 코드와 활동이 필요합니다." }, 400);
      if (!classAllowed(env, classCode)) return classError();
      const state = await ensureState(env.DB, classCode, activityId);
      const rows = await env.DB.prepare("SELECT team_name, choice, confidence, reason, updated_at FROM classroom_votes WHERE class_code = ? AND activity_id = ? ORDER BY updated_at").bind(classCode, activityId).all();
      return json({ activityId, open: Boolean(state.open), revealed: Boolean(state.revealed), correctChoice: state.correct_choice, submissionCount: rows.results.length, votes: rows.results });
    }
    if (path === "/api/instructor/scores" && request.method === "GET") {
      const classCode = classOf(url.searchParams.get("class_code"));
      if (!classCode) return json({ error: "수업 코드가 필요합니다." }, 400);
      if (!classAllowed(env, classCode)) return classError();
      const rows = await env.DB.prepare("SELECT activity_id, team_name, value, detail, updated_at FROM classroom_scores WHERE class_code = ? ORDER BY updated_at").bind(classCode).all();
      return json({ scores: rows.results });
    }
    if (path === "/api/instructor/state" && request.method === "POST") {
      const data = await body(request);
      const classCode = classOf(data.classCode);
      const activityId = safe(data.activityId, 40);
      if (!classCode || !ACTIVITIES.has(activityId)) return json({ error: "수업 코드와 활동이 필요합니다." }, 400);
      if (!classAllowed(env, classCode)) return classError();
      const current = await ensureState(env.DB, classCode, activityId);
      const open = data.open === undefined ? current.open : Number(Boolean(data.open));
      const revealed = data.revealed === undefined ? current.revealed : Number(Boolean(data.revealed));
      const correct = data.correctChoice === undefined ? current.correct_choice : (CHOICES.has(safe(data.correctChoice, 8)) ? safe(data.correctChoice, 8) : null);
      if (revealed && !correct) return json({ error: "정답 문자를 함께 보내야 공개할 수 있습니다." }, 400);
      await env.DB.prepare("UPDATE classroom_activity_state SET open=?, revealed=?, correct_choice=?, updated_at=? WHERE class_code=? AND activity_id=?").bind(open, revealed, correct, now(), classCode, activityId).run();
      return json({ ok: true });
    }
    if (path === "/api/instructor/reset" && request.method === "POST") {
      const data = await body(request);
      const classCode = classOf(data.classCode);
      const activityId = safe(data.activityId, 40);
      if (!classCode) return json({ error: "수업 코드가 필요합니다." }, 400);
      if (!classAllowed(env, classCode)) return classError();
      if (activityId && !ACTIVITIES.has(activityId)) return json({ error: "알 수 없는 활동입니다." }, 400);
      if (activityId) {
        await env.DB.prepare("DELETE FROM classroom_votes WHERE class_code=? AND activity_id=?").bind(classCode, activityId).run();
        await env.DB.prepare("UPDATE classroom_activity_state SET open=?, revealed=0, correct_choice=NULL, updated_at=? WHERE class_code=? AND activity_id=?").bind(defaultOpen(activityId), now(), classCode, activityId).run();
      } else {
        await env.DB.prepare("DELETE FROM classroom_votes WHERE class_code=?").bind(classCode).run();
        await env.DB.prepare("DELETE FROM classroom_scores WHERE class_code=?").bind(classCode).run();
        await env.DB.prepare("UPDATE classroom_activity_state SET open=CASE WHEN activity_id='round3' THEN 0 ELSE 1 END, revealed=0, correct_choice=NULL, updated_at=? WHERE class_code=?").bind(now(), classCode).run();
      }
      return json({ ok: true });
    }
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const api = await handleApi(request, env);
    if (api) return api;
    return asset(new URL(request.url).pathname) || new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  },
};
