export type Stage = 'idle' | 'waiting' | 'go' | 'tooSoon' | 'done';

export type Trial = {
  index: number;
  cueAt: number; // 合図を出した時刻
  reactAt: number | null; // 反応した時刻
  ms: number | null; // 反応時間 = reactAt - cueAt
  early: boolean; // 合図前に押した
};

export type SessionStats = {
  min: number | null;
  avg: number | null;
};

export type SessionSummary = {
  trials: Trial[];
  stats: SessionStats;
};
