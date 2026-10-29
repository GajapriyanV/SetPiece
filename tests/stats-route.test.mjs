import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function route({ redisDown = false, databaseDown = false, empty = false, go = false, goDown = false, profilesGo = false, observed = {}, waitForLive, waitForDurable } = {}) {
  let debateQuery = 0;
  const supabase = {
    from(table) {
      const index = table === "debates" ? debateQuery++ : -1;
      const result = databaseDown
        ? { error: { message: "private database details" } }
        : table === "profiles"
          ? empty ? { data: null, error: { code: "PGRST116" } } : { data: { username: "fixture", wins: 4 } }
          : index === 2 ? { data: [{ votes_a: 3, votes_b: 2 }, { votes_a: null, votes_b: 1 }] }
            : { count: index === 0 ? 6 : 4 };
      return {
        select() { return this; }, order() { return this; }, limit() { return this; },
        gte() { return this; }, lt() { return this; }, eq() { return this; },
        single() { return Promise.resolve(result); },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      };
    },
  };
  const imports = {
    "@/lib/profile-mode": {usesGoProfiles:()=>profilesGo},
    "@/lib/server/account-proxy": {accountProxy:async(path,request,authenticated)=>{
      assert.equal(path,"/api/statistics");assert.equal(authenticated,false);
      observed.durable=(observed.durable??0)+1;
      if(waitForDurable)await waitForDurable;
      return Response.json(databaseDown?{error:"Service temporarily unavailable"}:{mostWins:null,debatesToday:3,debatesPctChange:null,votesCastAllTime:99},{status:databaseDown?503:200});
    }},
    "next/server": { NextResponse: Response },
    "@/utils/supabase/server": { createClient: async () => {observed.supabase=(observed.supabase??0)+1;if(profilesGo)throw Error("Unneeded legacy client");return supabase;} },
    "@/lib/redis": { redis: {
      async smembers() { observed.redis=(observed.redis??0)+1; if (redisDown) throw new Error("private Redis details"); return ["one", "two"]; },
      async hlen() { return 2; },
    } },
  };
  const source = fs.readFileSync("app/api/stats/route.ts", "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports,
    process: { env: { NEXT_PUBLIC_ROOM_BACKEND: go ? "go" : "legacy" } }, URL, AbortSignal,
    fetch: async url => { observed.live=(observed.live??0)+1;if(waitForLive)await waitForLive; assert.equal(String(url), "http://127.0.0.1:3002/api/rooms/stats"); return { ok: !goDown, json: async () => ({ debatingNow: 7 }) }; },
    console: { warn() {} }, require(name) {
      if (!(name in imports)) throw new Error("Unexpected import " + name);
      return imports[name];
    },
  });
  return testModule.exports;
}

test("landing statistics preserve counts when Redis is unavailable", async () => {
  const response = await route({ redisDown: true }).GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    mostWins: { username: "fixture", wins: 4 }, debatesToday: 6,
    debatesPctChange: 50, votesCastAllTime: 6, debatingNow: null,
  });
});

test("healthy live statistics include room member counts", async () => {
  const response = await route().GET();
  assert.equal((await response.json()).debatingNow, 4);
});

test("empty profiles remain a successful statistics response", async () => {
  const response = await route({ empty: true }).GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mostWins, null);
});

test("database failure returns sanitized JSON instead of an empty error body", async () => {
  const response = await route({ databaseDown: true }).GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Statistics temporarily unavailable" });
});

test("Go live counts come from Go even when Redis is down", async () => {
 const response = await route({ go: true, redisDown: true }).GET();
 assert.equal((await response.json()).debatingNow, 7);
});
test("Go outage never falls back to unrelated legacy counts", async () => {
 const response = await route({ go: true, goDown: true }).GET();
 assert.equal((await response.json()).debatingNow, null);
});

test("fully migrated stats run independent reads concurrently with no Redis or legacy Supabase client",async()=>{
 let finishLive,finishDurable;const live=new Promise(r=>finishLive=r),durable=new Promise(r=>finishDurable=r);const observed={};
 const pending=route({go:true,profilesGo:true,redisDown:true,observed,waitForLive:live,waitForDurable:durable}).GET();
 await Promise.resolve();await Promise.resolve();
 assert.equal(observed.live,1);assert.equal(observed.durable,1);
 finishDurable();finishLive();
 const res=await pending;assert.equal(res.status,200);assert.equal((await res.json()).votesCastAllTime,99);
 assert.equal(observed.redis,undefined);assert.equal(observed.supabase,undefined);
});

test("Go durable stats preserve selected legacy live counts and degrade on Redis outage",async()=>{
 for(const redisDown of [false,true]){
 const observed={};const res=await route({profilesGo:true,redisDown,observed}).GET();
 assert.equal(res.status,200);const data=await res.json();assert.equal(data.votesCastAllTime,99);assert.equal(data.debatingNow,redisDown?null:4);
 assert.equal(observed.redis,1);assert.equal(observed.supabase,undefined);
 }
});

test("Go durable outage remains sanitized with no legacy fallback or cached success",async()=>{
 const observed={};const res=await route({profilesGo:true,go:true,databaseDown:true,observed}).GET();
 assert.equal(res.status,503);assert.deepEqual(await res.json(),{error:"Service temporarily unavailable"});
 assert.equal(observed.supabase,undefined);assert.equal(observed.redis,undefined);
});
