import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function module(path, globals = {}) {
 const exports = {};
 const code = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 vm.runInNewContext(code, { exports, module: { exports }, ...globals });
 return exports;
}
const state = module("lib/realtime/state.ts");
const base = { ...state.initialState, revision: 8, serverTime: 100000, countdownEndsAt: null, votingEndsAt: null, closingAt: null, sidePickEndsAt: null, ownVote: null, results: null };
test("reconnect replaces own vote/results and normalizes all server deadlines", () => {
 const result = state.snapshotState({ ...base, status: "voting", ownVote: "b", votingEndsAt: 120000, phase: { name: "voting", endsAt: 120000 }, chat: [] }, 90000);
 assert.equal(result.status, "voting"); assert.equal(result.myVote, "b");
 assert.equal(result.voteWindowEndsAt, 110000); assert.equal(result.phase.endsAt, 110000);
 const finished = state.snapshotState({ ...base, status: "closing", closingAt: 115000, results: { winner: "a" } }, 90000);
 assert.equal(finished.status, "results"); assert.equal(finished.results.winner, "a"); assert.equal(finished.closingAt, 105000);
});
test("countdown, pending finalization, cancellation and disconnection are recoverable", () => {
 const countdown = state.snapshotState({ ...base, status: "countdown", countdownEndsAt: 105000 }, 90000);
 assert.equal(countdown.status, "live"); assert.equal(countdown.countdown, 5);
 const pending = state.snapshotState({ ...base, status: "awaiting_result" }, 90000);
 assert.equal(pending.status, "voting"); assert.equal(pending.myVote, null);
 const disconnected = state.snapshotState({ ...base, debaterA: { userId: "a" }, members: [{ userId: "a", username: "A", departAt: 100100 }] }, 90000);
 assert.equal(disconnected.disconnectedDebater.username, "A");
 const closed = state.snapshotState({ ...base, status: "closed" }, 90000);
 assert.equal(closed.closed, true); assert.equal(closed.results, null);
});
test("chat snapshots deduplicate and remain bounded", () => {
 const messages = Array.from({ length: 250 }, (_, i) => ({ id: String(i), body: "message" }));
 const result = state.uniqueChat([...messages, messages.at(-1)]);
 assert.equal(result.length, 200); assert.equal(result[0].id, "50"); assert.equal(result.at(-1).id, "249");
});
test("room routing survives creation flag changes and Go pagination adds ownership prefix", async () => {
 const paths = [];
 const config = module("lib/realtime/config.ts", { process: { env: { NEXT_PUBLIC_ROOM_BACKEND: "go" } }, URL, AbortSignal,
 fetch: async url => { paths.push(String(url)); return { ok: true, json: async () => paths.length === 1 ? { rooms: [{ roomId: "abcdef12" }], nextCursor: "abcdef12" } : { rooms: [{ roomId: "abcdef13" }], nextCursor: "" } }; } });
 assert.equal(config.roomTarget("abcdef12").backend, "legacy"); assert.equal(config.roomTarget("g2-abcdef12").backend, "go");
 assert.equal(config.roomPath("abcdef12"), "/rooms/g2-abcdef12");
 const rooms = await config.listRooms();
 assert.equal(rooms.length, 2); assert.equal(rooms[1].roomId, "g2-abcdef13"); assert.ok(paths[1].endsWith("after=abcdef12"));
});
