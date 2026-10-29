// Package leaderboard contains rating math shared by transactional finalization.
package leaderboard

import "math"

type Ratings struct{ A, B, DeltaA, DeltaB int }

// Calculate preserves the legacy K=32, denominator=400, JavaScript Math.round.
// Scores must be 0, 0.5 or 1; the voting service derives them from durable totals.
func Calculate(a, b int, scoreA float64) Ratings {
	expectedA := 1 / (1 + math.Pow(10, float64(b-a)/400))
	nextA := int(math.Floor(float64(a) + 32*(scoreA-expectedA) + 0.5))
	nextB := int(math.Floor(float64(b) + 32*((1-scoreA)-(1-expectedA)) + 0.5))
	return Ratings{A: nextA, B: nextB, DeltaA: nextA - a, DeltaB: nextB - b}
}
