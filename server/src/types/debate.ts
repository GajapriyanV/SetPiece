export interface Debate {
  id: string;
  room_code: string;
  topic: string;
  side_a_label: string;
  side_b_label: string;
  debater_a_id: string;
  debater_b_id: string;
  winner_id: string | null;
  result: "side_a" | "side_b" | "draw" | null;
  votes_a: number;
  votes_b: number;
  elo_change: number | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface Vote {
  id: string;
  debate_id: string;
  user_id: string;
  side: "a" | "b";
  created_at: string;
}
