import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Stage, Trial, SessionSummary } from '@/types/reaction';

type Options = {
  totalTrials?: number; // 試行回数
  minDelayMs?: number; // 合図までの最小遅延
  maxDelayMs?: number; // 合図までの最大遅延
  cooldownMs?: number; // 合図直後の誤爆防止
};

export function useReactionTap(opts: Options = {}) {
  const totalTrials = opts.totalTrials ?? 1;
  const minDelayMs = opts.minDelayMs ?? 1500;
  const maxDelayMs = opts.maxDelayMs ?? 4000;
  const cooldownMs = opts.cooldownMs ?? 120;

  const [stage, setStage] = useState<Stage>('idle');
  const [trialIndex, setTrialIndex] = useState(0);
  const [trials, setTrials] = useState<Trial[]>([]);
  const cueAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const lockedUntilRef = useRef<number>(0);

  const remaining = totalTrials - trials.length;

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleCue = useCallback(() => {
    clearTimer();
    setStage('waiting');
    const delay = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
    timerRef.current = window.setTimeout(() => {
      cueAtRef.current = performance.now();
      lockedUntilRef.current = cueAtRef.current + cooldownMs;
      setStage('go');
    }, delay);
  }, [minDelayMs, maxDelayMs, cooldownMs]);

  const start = useCallback(() => {
    // セッション開始/再開
    setTrials([]);
    setTrialIndex(0);
    cueAtRef.current = null;
    scheduleCue();
  }, [scheduleCue]);

  const restartSameTrial = useCallback(() => {
    cueAtRef.current = null;
    setStage('waiting');
    window.setTimeout(scheduleCue, 450);
  }, [scheduleCue]);

  const finalizeTrial = useCallback(
    (reactAt: number) => {
      const cueAt = cueAtRef.current!;
      const ms = Math.max(0, Math.round(reactAt - cueAt));
      const nextTrial: Trial = {
        index: trialIndex,
        cueAt,
        reactAt,
        ms,
        early: false,
      };
      setTrials((prev) => [...prev, nextTrial]);

      if (trialIndex + 1 >= totalTrials) {
        setStage('done');
      } else {
        setTrialIndex((v) => v + 1);
        scheduleCue();
      }
    },
    [trialIndex, totalTrials, scheduleCue]
  );

  const react = useCallback(() => {
    const now = performance.now();

    // 合図前
    if (stage === 'waiting') {
      setStage('tooSoon');
      clearTimer();
      restartSameTrial();
      return;
    }

    // 合図直後のロック（誤爆防止）
    if (stage === 'go' && now < lockedUntilRef.current) {
      return;
    }

    if (stage === 'go' && cueAtRef.current != null) {
      finalizeTrial(now);
      return;
    }
  }, [stage, finalizeTrial, restartSameTrial]);

  const stats = useMemo(() => {
    const vals = trials.map((t) => t.ms).filter((v): v is number => v != null);
    if (!vals.length) return { min: null, avg: null };
    const min = Math.min(...vals);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    return { min, avg };
  }, [trials]);

  const summary: SessionSummary | null = stage === 'done' ? { trials, stats } : null;

  useEffect(() => () => clearTimer(), []);

  return {
    // state
    stage,
    trialIndex,
    remaining,
    trials,
    stats,
    summary,
    // actions
    start,
    react,
  };
}
