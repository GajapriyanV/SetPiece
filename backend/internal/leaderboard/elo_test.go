package leaderboard

import "testing"

func TestLegacyElo(t *testing.T) {
	for _, c := range []struct {
		a, b  int
		score float64
		want  Ratings
	}{
		{1200, 1200, 1, Ratings{1216, 1184, 16, -16}},
		{1200, 1200, 0, Ratings{1184, 1216, -16, 16}},
		{1200, 1200, .5, Ratings{1200, 1200, 0, 0}},
		{1600, 1200, .5, Ratings{1587, 1213, -13, 13}},
		{1200, 1600, 1, Ratings{1229, 1571, 29, -29}},
	} {
		if got := Calculate(c.a, c.b, c.score); got != c.want {
			t.Fatalf("%+v: %+v", c, got)
		}
	}
}
