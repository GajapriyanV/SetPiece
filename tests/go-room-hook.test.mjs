import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function mount(enabled = true) {
 const effects = [], clients = [], values = [], timers = new Set();
 let authCallback, unsubscribed = false;
 class Transport {
  starts = 0; stops = 0; leaves = 0; signedOut = false;
  constructor(options) { this.options = options; clients.push(this); }
  async join() {}
  start() { this.starts++; }
  stop() { this.stops++; }
  async leave() { this.leaves++; }
  signOut() { this.signedOut = true; this.stop(); }
 }
 const imports = {
  react: {
   useEffect(fn) { effects.push(fn); },
   useState(initial) { const index = values.length; values.push(initial); return [initial, value => { values[index] = typeof value === "function" ? value(values[index]) : value; }]; },
   useRef(value) { return { current: value }; },
   useCallback(fn) { return fn; },
  },
  "@/utils/supabase/client": { createClient: () => ({ auth: {
   getSession: async () => ({ data: { session: { access_token: "current-token" } } }),
   onAuthStateChange(fn) { authCallback = fn; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
  } }) },
  "@/lib/realtime/client": { RoomTransport: Transport },
  "@/lib/realtime/config": { goHTTPURL: "http://127.0.0.1:3002", goWSURL: "ws://127.0.0.1:3002/api/realtime/ws" },
  "@/lib/realtime/state": { initialState: { roomId: "", chat: [] }, snapshotState: s => s, uniqueChat: s => s },
 };
 const exports = {};
 const code = ts.transpileModule(fs.readFileSync("hooks/useGoRoom.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 vm.runInNewContext(code, { exports, module: { exports }, require: name => imports[name],
  setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); },
 });
 exports.useGoRoom("abcdef12", enabled);
 const cleanup = effects.map(fn => fn()).filter(Boolean);
 return { clients, values, timers, unmount: () => cleanup.forEach(fn => fn()), auth: event => authCallback(event), unsubscribed: () => unsubscribed };
}
const flush = async () => { for (let i=0;i<10;i++) await Promise.resolve(); };
test("Strict Mode disposal before asynchronous join never starts an orphan transport", async () => {
 const f = mount(); f.unmount(); await flush();
 assert.equal(f.clients[0].starts, 0); assert.equal(f.clients[0].stops, 1);
 assert.equal(f.timers.size, 0); assert.equal(f.unsubscribed(), true);
});
test("disabled Go hook does not connect a legacy room", async () => {
 const f = mount(false); await flush();
 assert.equal(f.clients.length, 0); assert.equal(f.timers.size, 0);
});
test("active hook uses fresh session access and stops on sign-out", async () => {
 const f = mount(); await flush();
 assert.equal(f.clients[0].starts, 1);
 assert.equal(await f.clients[0].options.getAccessToken(), "current-token");
 f.clients[0].options.onEvent({ type: "room:joined", data: { state: { roomId: "abcdef12", ownVote: "a", chat: [] } } });
 assert.equal(f.values[0].ownVote, "a");
 f.auth("SIGNED_OUT"); assert.equal(f.clients[0].signedOut, true);
 f.unmount(); await flush(); assert.equal(f.timers.size, 0);
});
