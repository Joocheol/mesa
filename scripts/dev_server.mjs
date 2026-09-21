#!/usr/bin/env node
// Local classroom server: serves site/ from disk and runs worker/index.js against an
// in-memory SQLite database that mimics the D1 binding. Instructor password: "mesa".
//
//   node scripts/dev_server.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8787);

// ---- D1 shim over node:sqlite ----
class D1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...params) { this.params = params; return this; }
  async run() { this.db.prepare(this.sql).run(...this.params); return { success: true }; }
  async first() { return this.db.prepare(this.sql).get(...this.params) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.params) }; }
}
class D1 {
  constructor() { this.db = new DatabaseSync(":memory:"); this.db.exec(readFileSync(path.join(ROOT, "drizzle/0000_classroom.sql"), "utf8")); }
  prepare(sql) { return new D1Statement(this.db, sql); }
}

const source = readFileSync(path.join(ROOT, "worker/index.js"), "utf8").replace("__ASSET_MAP__", "{}");
const worker = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const env = {
  DB: new D1(),
  INSTRUCTOR_PASSWORD_HASH: process.env.INSTRUCTOR_PASSWORD_HASH || createHash("sha256").update(process.env.INSTRUCTOR_PASSWORD || "mesa").digest("hex"),
  SESSION_SIGNING_SECRET: process.env.SESSION_SIGNING_SECRET || "dev-only-signing-secret",
};

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".csv": "text/csv; charset=utf-8", ".svg": "image/svg+xml", ".md": "text/markdown; charset=utf-8", ".png": "image/png" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const response = await worker.handleApi(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  const rel = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.join(ROOT, "site", rel);
  if (!file.startsWith(path.join(ROOT, "site"))) { res.writeHead(403); res.end(); return; }
  try {
    await stat(file);
    res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}).listen(PORT, () => console.log(`workshop dev server → http://127.0.0.1:${PORT}  (강사 비밀번호: ${process.env.INSTRUCTOR_PASSWORD || "mesa"})`));
