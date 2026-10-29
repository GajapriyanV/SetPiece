import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function fixture() {
  const timers = new Map(); let nextTimer = 1; let tokens = 0; const sockets = []; const fetched = []; const events = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 0; sent = []; closed = false;
    constructor(url) { this.url = String(url); sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.(); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.closed = true; this.readyState = 3; this.onclose?.(); }
    event(event) { this.onmessage?.({ data: JSON.stringify(event) }); }
  }
  const testModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("lib/realtime/client.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports, URL, AbortController, TextEncoder,
    crypto: { randomUUID: () => "request_" + nextTimer }, WebSocket: FakeSocket,
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn: () => { timers.delete(id); fn(); }, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => { fetched.push({ url: String(url), options }); return { ok: true, json: async () => ({ protocolVersion: 1, ticket: "a".repeat(43) }) }; },
  });
  const client = new testModule.exports.RoomTransport({
    baseURL: "https://go.example", getAccessToken: async () => "token" + ++tokens,
    onEvent: event => events.push(event),
  });
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  const ack = (socket, request, sequence = 2) => socket.event({ v: 1, type: "ack", requestId: request.requestId, sequence, data: {} });
  return { client, sockets, timers, fetched, events, flush, ack, tokens: () => tokens };
}
test("fresh tickets on reconnect, jitter, automatic rejoin and no queued leave", async () => {
  const f = fixture(); await f.client.join("abcdef12"); f.client.start(); await f.flush();
  const first = f.sockets[0]; first.open(); assert.equal(first.sent[0].type, "room:join"); f.ack(first, first.sent[0], 1); await f.flush();
  first.close(); await f.flush();
  const retry = [...f.timers.values()].find(t => t.delay >= 500 && t.delay <= 1000); assert.ok(retry);
  // Navigation while offline clears desired room without buffering a leave.
  await f.client.leave(); retry.fn(); await f.flush();
  assert.equal(f.tokens(), 2); assert.equal(f.fetched[1].options.headers.Authorization, "Bearer token2");
  const second = f.sockets[1]; second.open(); assert.equal(second.sent.length, 0);
  assert.ok(!second.url.includes("token2")); assert.ok(second.url.startsWith("wss://"));
  f.client.signOut(); assert.ok(second.closed); assert.equal(f.timers.size, 0);
});
test("temporary loss rejoins and pending mutations are rejected, not replayed", async () => {
  const f = fixture(); f.client.start(); await f.flush(); const first = f.sockets[0]; first.open();
  const joining = f.client.join("abcdef12"); f.ack(first, first.sent[0], 1); await joining;
  const mutation = f.client.send("side:ready", { revision: 3 });
  const rejected = assert.rejects(mutation, /Connection lost/); first.close(); await rejected;
  const retry = [...f.timers.values()][0]; retry.fn(); await f.flush(); const second = f.sockets[1]; second.open();
  assert.deepEqual(second.sent.map(x => x.type), ["room:join"]); f.ack(second, second.sent[0], 1); await f.flush(); f.client.stop();
});
test("revision gaps request snapshot; stale and old-room events are ignored", async () => {
  const f = fixture(); await f.client.join("abcdef12"); f.client.start(); await f.flush(); const s = f.sockets[0]; s.open();
  s.event({ v: 1, type: "room:joined", roomId: "abcdef12", revision: 3, sequence: 1, data: { state: {} } });
  f.ack(s, s.sent[0], 2); await f.flush();
  s.event({ v: 1, type: "side:updated", roomId: "abcdef12", revision: 8, sequence: 3, data: {} });
  assert.equal(s.sent.at(-1).type, "room:state"); assert.ok(!f.events.some(e => e.type === "side:updated"));
  s.event({ v: 1, type: "room:state_sync", roomId: "abcdef12", revision: 8, sequence: 4, data: { state: {} } });
  f.ack(s, s.sent.at(-1), 5); await f.flush();
  const before = f.events.length;
  s.event({ v: 1, type: "room:state_sync", roomId: "abcdef12", revision: 7, sequence: 6, data: {} });
  s.event({ v: 1, type: "chat:message", roomId: "11223344", revision: 9, sequence: 7, data: {} });
  assert.equal(f.events.length, before); f.client.stop();
});
test("sign-out during token request prevents a socket and stop removes timers", async () => {
  const f = fixture(); f.client.start(); f.client.signOut(); await f.flush();
  assert.equal(f.sockets.length, 0); assert.equal(f.fetched.length, 0); assert.equal(f.timers.size, 0);
});
