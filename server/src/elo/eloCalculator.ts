const K = 32;

export function calculateElo(
  ratingA: number,
  ratingB: number,
  scoreA: number // 1 = A wins, 0 = B wins, 0.5 = draw
): { newRatingA: number; newRatingB: number; change: number } {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;

  const scoreB = 1 - scoreA;

  const newRatingA = Math.round(ratingA + K * (scoreA - expectedA));
  const newRatingB = Math.round(ratingB + K * (scoreB - expectedB));

  const change = Math.abs(newRatingA - ratingA);

  return { newRatingA, newRatingB, change };
}
