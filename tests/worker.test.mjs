import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

class D1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...params) { this.params = params; return this; }
  async run() { this.db.prepare(this.sql).run(...this.params); return { success: true }; }
  async first() { return this.db.prepare(this.sql).get(...this.params) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.params) }; }
}

class D1 {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort()) {
      this.db.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
    }
  }
  prepare(sql) { return new D1Statement(this.db, sql); }
}

const source = readFileSync(new URL("../worker/index.js", import.meta.url), "utf8")
  .replace("__ASSET_MAP__", JSON.stringify({ "/index.html": Buffer.from("<!doctype html><title>test</title>").toString("base64") }));
const worker = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const makeEnv = () => ({
  DB: new D1(),
  CLASS_CODE: "MESA",
  INSTRUCTOR_PASSWORD_HASH: createHash("sha256").update("teacher-pass").digest("hex"),
  SESSION_SIGNING_SECRET: "test-signing-secret",
});

const request = (path, { method = "GET", json, headers = {} } = {}) => new Request(`https://example.test${path}`, {
  method,
  headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.5", ...headers },
  body: json === undefined ? undefined : JSON.stringify(json),
});

test("configured class code is enforced and diagnostic values are bounded", async () => {
  const env = makeEnv();
  assert.equal((await worker.handleApi(request("/api/vote/state?class_code=OTHER&activity_id=round1"), env)).status, 403);
  const base = { classCode: "MESA", activityId: "repair", voterId: "v1", teamName: "팀1", detail: "diagnostic" };
  assert.equal((await worker.handleApi(request("/api/score", { method: "POST", json: { ...base, value: 6 } }), env)).status, 400);
  assert.equal((await worker.handleApi(request("/api/score", { method: "POST", json: { ...base, value: 5 } }), env)).status, 200);
  const leaderboard = await worker.handleApi(request("/api/leaderboard?class_code=MESA"), env);
  assert.equal((await leaderboard.json()).scores[0].value, 5);
});

test("instructor login is rate limited and valid sessions verify", async () => {
  const env = makeEnv();
  for (let i = 0; i < 10; i += 1) {
    const response = await worker.handleApi(request("/api/instructor/login", { method: "POST", json: { password: "wrong" } }), env);
    assert.equal(response.status, 403);
  }
  assert.equal((await worker.handleApi(request("/api/instructor/login", { method: "POST", json: { password: "wrong" } }), env)).status, 429);

  const fresh = makeEnv();
  const login = await worker.handleApi(request("/api/instructor/login", { method: "POST", json: { password: "teacher-pass" } }), fresh);
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const me = await worker.handleApi(request("/api/instructor/me", { headers: { cookie } }), fresh);
  assert.deepEqual(await me.json(), { ok: true });
});

test("static and API responses include baseline security headers", async () => {
  const env = makeEnv();
  const page = await worker.default.fetch(request("/"), env);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'self'/);
  const api = await worker.handleApi(request("/api/vote/state?class_code=MESA&activity_id=round3"), env);
  assert.equal(api.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal((await api.json()).open, false);
});

test("facilitator state is private to the instructor and presentation is sanitized", async () => {
  const env = makeEnv();
  const login = await worker.handleApi(request("/api/instructor/login", { method: "POST", json: { password: "teacher-pass" } }), env);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const update = await worker.handleApi(request("/api/instructor/facilitation", {
    method: "POST",
    headers: { cookie },
    json: { classCode: "MESA", activityId: "round1", phase: "activity", durationSeconds: 900, message: "먼저 예상하세요." },
  }), env);
  assert.equal(update.status, 200);
  const denied = await worker.handleApi(request("/api/instructor/facilitation?class_code=MESA"), env);
  assert.equal(denied.status, 401);

  const publicView = await worker.handleApi(request("/api/presentation?class_code=MESA"), env);
  const payload = await publicView.json();
  assert.equal(payload.activityId, "round1");
  assert.equal(payload.phase, "activity");
  assert.equal(payload.message, "먼저 예상하세요.");
  assert.equal(payload.round.revealed, false);
  assert.equal(payload.round.correctChoice, undefined);
  assert.ok(payload.remainingSeconds <= 900 && payload.remainingSeconds >= 898);
});

test("50 simultaneous devices can check in, vote, and read presentation state", async () => {
  const env = makeEnv();
  const login = await worker.handleApi(request("/api/instructor/login", { method: "POST", json: { password: "teacher-pass" } }), env);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  await worker.handleApi(request("/api/instructor/facilitation", {
    method: "POST", headers: { cookie },
    json: { classCode: "MESA", activityId: "round1", phase: "activity", durationSeconds: 900, message: "" },
  }), env);
  const devices = Array.from({ length: 50 }, (_, i) => ({
    classCode: "MESA", voterId: `device-${i}`, teamName: `팀 ${i + 1}`, activityId: "round1",
  }));
  const checkins = await Promise.all(devices.map((entry) => worker.handleApi(request("/api/presence", { method: "POST", json: entry }), env)));
  assert.ok(checkins.every((response) => response.status === 200));

  const votes = await Promise.all(devices.map((entry, i) => worker.handleApi(request("/api/vote", {
    method: "POST",
    json: { ...entry, choice: ["A", "B", "C"][i % 3], confidence: 60, reason: "부하 검증용 응답" },
  }), env)));
  assert.ok(votes.every((response) => response.status === 200));

  const reads = await Promise.all(Array.from({ length: 50 }, () => worker.handleApi(request("/api/presentation?class_code=MESA"), env)));
  const snapshots = await Promise.all(reads.map((response) => response.json()));
  assert.ok(reads.every((response) => response.status === 200));
  assert.ok(snapshots.every((snapshot) => snapshot.activeDevices === 50));
  assert.ok(snapshots.every((snapshot) => snapshot.round.submissionCount === 50));
});
