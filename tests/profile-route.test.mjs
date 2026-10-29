import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const fixture = JSON.parse(fs.readFileSync("backend/internal/users/testdata/profile-contract.json", "utf8"));

function loadTS(path, imports = {}) {
  const source = fs.readFileSync(path, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports, process, Response, URL, AbortSignal,
    Uint8Array, TextDecoder, fetch,
    require(name) {
      if (!(name in imports)) throw new Error("Unexpected import " + name);
      return imports[name];
    },
  }, { filename: path });
  return testModule.exports;
}
const helper = loadTS("lib/server/profile-backend.ts");
function client({ user = fixture.user, session, missing = false } = {}) {
  return {
    auth: {
      async getUser() { return { data: { user } }; },
      async getSession() { return { data: { session } }; },
    },
    from(table) {
      let count = fixture.totalDebaters;
      const builder = {
        select() { return this; }, eq() { return this; }, order() { return this; },
        limit(n) { assert.equal(n, 20); return this; },
        or() { count = fixture.aboveCount; return this; },
        async single() { return { data: missing ? null : fixture.profile }; },
        then(resolve) { return Promise.resolve({ data: table === "debates" ? fixture.debates : null, count }).then(resolve); },
      };
      return builder;
    },
  };
}
function route(supabase, forward = helper.forwardProfileRead) {
  return loadTS("app/api/profile/me/route.ts", {
    "@/lib/profile-mode": {usesGoProfiles:()=>false},
    "@/lib/server/account-proxy": {accountProxy:()=>{throw new Error("Unexpected phase 4 forwarding");}},
    "next/server": { NextResponse: Response },
    "@/utils/supabase/server": { createClient: async () => supabase },
    "@/lib/redis": { cacheUserProfile() { throw new Error("GET must not mutate cache"); } },
    "@/lib/server/profile-backend": { usesGoProfileRead: helper.usesGoProfileRead, forwardProfileRead: forward },
  });
}
test("legacy route matches the shared Go response fixture", async () => {
  process.env.TZ = "UTC";
  delete process.env.PROFILE_READ_BACKEND;
  const response = await route(client()).GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), fixture.expected);
});
test("forwarding is opt-in and rollback restores the complete legacy GET", async () => {
  const session = { user: fixture.user, access_token: "test-user-token" };
  let forwarded = 0;
  const handler = route(client({ session }), async (token) => {
    assert.equal(token, session.access_token);
    forwarded++;
    return Response.json(fixture.expected);
  });
  process.env.PROFILE_READ_BACKEND = "go";
  assert.deepEqual(await (await handler.GET()).json(), fixture.expected);
  delete process.env.PROFILE_READ_BACKEND;
  assert.deepEqual(await (await handler.GET()).json(), fixture.expected);
  assert.equal(forwarded, 1);
});
test("forwarding requires the verified user's session", async () => {
  process.env.PROFILE_READ_BACKEND = "go";
  const forward = async () => { throw new Error("Must not forward"); };
  for (const options of [
    { user: null },
    { session: null },
    { session: { user: { id: "another-user" }, access_token: "test" } },
  ]) assert.equal((await route(client(options), forward).GET()).status, 401);
  delete process.env.PROFILE_READ_BACKEND;
  assert.equal((await route(client({ missing: true })).GET()).status, 404);
});
test("HTTP forwarding sends only the user token, disables caching and rejects redirects", async () => {
  process.env.GO_API_URL = "http://127.0.0.1:3002";
  process.env.NODE_ENV = "test";
  const response = await helper.forwardProfileRead("user-token", async (url, options) => {
    assert.equal(url.href, "http://127.0.0.1:3002/api/profile/me");
    assert.equal(options.headers.Authorization, "Bearer user-token");
    assert.equal(options.method, "GET");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    return Response.json(fixture.expected);
  });
  assert.deepEqual(await response.json(), fixture.expected);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("backend failures are bounded and never replayed or leaked", async () => {
  let calls = 0;
  const failed = await helper.forwardProfileRead("secret", async () => {
    calls++;
    throw new Error("postgres://secret@private");
  });
  assert.equal(failed.status, 503);
  assert.equal(calls, 1);
  assert.ok(!(await failed.text()).includes("secret"));
  for (const [status, expected] of [[401,401],[404,404],[503,503],[500,502],[302,502]]) {
    const response = await helper.forwardProfileRead("secret", async () => Response.json({ error: "secret" }, { status }));
    assert.equal(response.status, expected);
    assert.ok(!(await response.text()).includes("secret"));
  }
  const oversized = await helper.forwardProfileRead("secret", async () => new Response("x".repeat(1024*1024+1), { headers: { "content-type": "application/json" } }));
  assert.equal(oversized.status,503);
});
test("bad configuration fails before sending any credential", async () => {
  for (const url of ["", "https://user:password@example.com", "https://example.com/path", "https://example.com?token=secret", "http://example.com"]) {
    process.env.GO_API_URL = url;
    const response = await helper.forwardProfileRead("secret", async () => { throw new Error("Should not call fetch"); });
    assert.equal(response.status,503);
  }
});
