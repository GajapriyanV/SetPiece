import type { PhaseName, Side } from "../types/room.js";

export interface PhaseDefinition {
  name: PhaseName;
  speaker: Side;
  durationMs: number;
}

export const DEBATE_PHASES: PhaseDefinition[] = [
  { name: "opening_a", speaker: "a", durationMs: 150_000 },   // 2m 30s
  { name: "opening_b", speaker: "b", durationMs: 150_000 },   // 2m 30s
  { name: "rebuttal_a", speaker: "a", durationMs: 60_000 },   // 1m
  { name: "rebuttal_b", speaker: "b", durationMs: 60_000 },   // 1m
  { name: "closing_a", speaker: "a", durationMs: 30_000 },    // 30s
  { name: "closing_b", speaker: "b", durationMs: 30_000 },    // 30s
];

export const VOTING_DURATION_MS = 30_000; // 30s
export const STARTING_COUNTDOWN_MS = 5_000; // 5s
export const SIDE_PICK_TIMEOUT_MS = 60_000; // 60s
export const RESULTS_DISPLAY_MS = 60_000; // 60s
export const FEATURED_SIDE_PICK_TIMEOUT_MS = 30_000; // 30s
export const FEATURED_INACTIVITY_TIMEOUT_MS = 2_400_000; // 40 min
export const CLOSING_WARNING_MS = 30_000; // 30s

export function getPhaseByIndex(index: number): PhaseDefinition | null {
  return DEBATE_PHASES[index] ?? null;
}

export function isLastPhase(index: number): boolean {
  return index >= DEBATE_PHASES.length - 1;
}
