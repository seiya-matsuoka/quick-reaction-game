import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { getMediapipeConfig } from '@/config/mediapipe';

type Mode = 'mouth' | 'blink' | 'nod';

export type GestureOptions = {
  mode?: Mode;
  /** 反応しきい値（0〜1） */
  threshold?: number;
  /** 連続フレーム数（この回数以上しきい値超過で確定） */
  consecutive?: number;
  /** 確定後のデッドタイム（ms） */
  deadTimeMs?: number;
  /** 何フレームに1回推論するか（負荷軽減）。最小1（=毎フレーム） */
  sampleEveryN?: number;
  /** 推論の最大FPS（既定30）。sampleEveryN と併用で更に軽量化 */
  maxFps?: number;
  /** 確定したら呼ばれる */
  onGesture?: (kind: Mode, ts: number) => void;
  /** デバッグ/可視化用にスコアを通知（例: { mouth: 0.53 }） */
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

/**
 * MediaPipe FaceLandmarker を使ってカメラ映像を推論し、
 * 指定ジェスチャを検出するフック。
 * モデル/WASMは config(環境変数) から取得。
 */
export function useGestureDetector(
  videoRef: React.RefObject<HTMLVideoElement>,
  opts: GestureOptions = {}
): DetectorState {
  const mode = opts.mode ?? 'mouth';
  const threshold = opts.threshold ?? 0.6;
  const consecutive = opts.consecutive ?? 2;
  const deadTimeMs = opts.deadTimeMs ?? 300;
  const sampleEveryN = Math.max(1, opts.sampleEveryN ?? 1);
  const maxFps = Math.max(5, opts.maxFps ?? 30); // 下限5fps
  const frameBudgetMs = 1000 / maxFps;

  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const consecRef = useRef(0);
  const lockedUntilRef = useRef(0);
  const lastInferRef = useRef(0);

  // ----- 初期化（WASM と モデルをロード） -----
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
            break; // 成功
          } catch (err) {
            lastErr = err;
          }
        }
        if (!lm) throw lastErr ?? new Error('Failed to load FaceLandmarker');

        if (cancelled) {
          const closable = lm as unknown as { close?: () => void };
          try {
            closable.close?.();
          } catch (_err) {
            void _err;
          }
          return;
        }
        landmarkerRef.current = lm;
        setReady(true);
      } catch (_err) {
        console.error('[useGestureDetector] init error:', _err);
      }
    })();

    return () => {
      cancelled = true;
      const lm = landmarkerRef.current;
      landmarkerRef.current = null;
      if (lm) {
        const closable = lm as unknown as { close?: () => void };
        try {
          closable.close?.();
        } catch (_err) {
          void _err;
        }
      }
    };
  }, []);

  // ----- ループ開始/停止 -----
  const start = useCallback(() => {
    if (!ready || running) return;
    setRunning(true);

    const loop = async () => {
      const video = videoRef.current;
      const lm = landmarkerRef.current;
      if (!video || !lm || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      frameCountRef.current++;

      const now = performance.now();
      const frameSlot = now - lastInferRef.current >= frameBudgetMs;
      const sampled = frameCountRef.current % sampleEveryN === 0;

      if (frameSlot && sampled) {
        lastInferRef.current = now;

        try {
          const res = lm.detectForVideo(video, now);
          const bs = res.faceBlendshapes?.[0]?.categories ?? [];
          const scores: Record<string, number> = {};
          for (const c of bs) scores[c.categoryName] = c.score;

          // 口開き検出
          if (mode === 'mouth') {
            const sMouth = pickScore(scores, ['mouthOpen', 'jawOpen', 'lipsParted']) ?? 0;

            // デバッグ/可視化
            opts.onScores?.({ mouth: sMouth }, now);

            if (now >= lockedUntilRef.current) {
              if (sMouth >= threshold) {
                consecRef.current += 1;
                if (consecRef.current >= consecutive) {
                  consecRef.current = 0;
                  lockedUntilRef.current = now + deadTimeMs;
                  opts.onGesture?.('mouth', now);
                }
              } else {
                consecRef.current = 0;
              }
            }
          }
        } catch (_err) {
          void _err;
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

  // アンマウント時は必ず停止
  useEffect(() => () => stop(), [stop]);

  return { ready, running, start, stop };
}
