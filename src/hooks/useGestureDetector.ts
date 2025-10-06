import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { getMediapipeConfig } from '@/config/mediapipe';

type Mode = 'mouth' | 'blink';

export type GestureOptions = {
  mode?: Mode;
  threshold?: number;
  consecutive?: number;
  deadTimeMs?: number;
  sampleEveryN?: number;
  maxFps?: number;
  onGesture?: (kind: Mode, ts: number) => void;
  onScores?: (scores: Record<string, number>, ts: number) => void;
};

export type DetectorState = {
  ready: boolean;
  running: boolean;
  start: () => void;
  stop: () => void;
};

function pickScore(scores: Record<string, number>, names: string[]): number | undefined {
  for (const want of names) {
    const key = Object.keys(scores).find((k) => k.toLowerCase() === want.toLowerCase());
    if (key) return scores[key];
  }
  return undefined;
}

export function useGestureDetector(
  videoRef: React.RefObject<HTMLVideoElement>,
  opts: GestureOptions = {}
): DetectorState {
  const mode = opts.mode ?? 'mouth';
  const threshold = opts.threshold ?? (mode === 'blink' ? 0.55 : 0.6);
  const consecutive = opts.consecutive ?? 2;
  const deadTimeMs = opts.deadTimeMs ?? 300;
  const sampleEveryN = Math.max(1, opts.sampleEveryN ?? 2);
  const maxFps = Math.max(5, opts.maxFps ?? 24);

  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const consecRef = useRef(0);
  const lockedUntilRef = useRef(0);
  const lastInferRef = useRef(0);
  const frameBudgetMs = 1000 / maxFps;

  // 初期化（WASM & モデルロード）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { wasmBase, modelUrls } = getMediapipeConfig();
        const fileset = await FilesetResolver.forVisionTasks(wasmBase);

        let lm: FaceLandmarker | null = null;
        let lastErr: unknown = null;
        for (const url of modelUrls) {
          try {
            lm = await FaceLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: url },
              runningMode: 'VIDEO',
              numFaces: 1,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: false,
            });
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!lm) throw lastErr ?? new Error('Failed to load FaceLandmarker');

        // 作成直後のキャンセル分岐
        if (cancelled) {
          const closable = lm as unknown as { close?: () => void };
          closable.close?.();
          return;
        }
        landmarkerRef.current = lm;
        setReady(true);
      } catch (e) {
        console.error('[useGestureDetector] init error:', e);
      }
    })();

    // useEffect の cleanup（アンマウント）
    return () => {
      cancelled = true;
      const lm = landmarkerRef.current;
      landmarkerRef.current = null;
      if (lm) {
        const closable = lm as unknown as { close?: () => void };
        closable.close?.();
      }
    };
  }, []);

  // ループ開始/停止
  const start = useCallback(() => {
    if (!ready || running) return;
    setRunning(true);

    const loop = () => {
      const video = videoRef.current;
      const lm = landmarkerRef.current;
      if (!video || !lm || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      frameCountRef.current += 1;
      const now = performance.now();
      const timeOK = now - lastInferRef.current >= frameBudgetMs;
      const sampled = frameCountRef.current % sampleEveryN === 0;

      if (timeOK && sampled) {
        lastInferRef.current = now;

        try {
          const res = lm.detectForVideo(video, now);
          const cats = res.faceBlendshapes?.[0]?.categories ?? [];
          const scores: Record<string, number> = {};
          for (const c of cats) scores[c.categoryName] = c.score;

          // スコア計算
          let s = 0;
          if (mode === 'mouth') {
            s = pickScore(scores, ['mouthOpen', 'jawOpen', 'lipsParted']) ?? 0;
            opts.onScores?.({ mouth: s }, now);
          } else {
            const l = pickScore(scores, ['eyeBlinkLeft', 'eyeBlinkL']) ?? 0;
            const r = pickScore(scores, ['eyeBlinkRight', 'eyeBlinkR']) ?? 0;
            s = Math.max(l, r);
            opts.onScores?.({ blink: s }, now);
          }

          // 確定判定
          if (now >= lockedUntilRef.current) {
            if (s >= threshold) {
              consecRef.current += 1;
              if (consecRef.current >= consecutive) {
                consecRef.current = 0;
                lockedUntilRef.current = now + deadTimeMs;
                opts.onGesture?.(mode, now);
              }
            } else {
              consecRef.current = 0;
            }
          }
        } catch {
          // 停止直後などは握り潰し
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [
    ready,
    running,
    videoRef,
    frameBudgetMs,
    sampleEveryN,
    deadTimeMs,
    consecutive,
    threshold,
    mode,
    opts,
  ]);

  const stop = useCallback(() => {
    setRunning(false);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    consecRef.current = 0;
    lastInferRef.current = 0;
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { ready, running, start, stop };
}
