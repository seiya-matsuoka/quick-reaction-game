import { useEffect, useRef, useState } from 'react';
import { useUserMedia } from '@/hooks/useUserMedia';
import { useGestureDetector } from '@/hooks/useGestureDetector';

type Props = {
  hidden?: boolean;
  mode?: 'mouth' | 'blink' | 'nod';
  onGestureStop?: () => void;
  thresholdDefault?: number;
  armed?: boolean;
};

export default function CameraPreview({
  hidden,
  mode = 'mouth',
  onGestureStop,
  thresholdDefault = 0.5,
  armed = false,
}: Props) {
  const [mirrored, setMirrored] = useState(true);
  const [mouth, setMouth] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<number>(thresholdDefault);
  const [calibrating, setCalibrating] = useState(false);

  // キャリブ用のバッファ
  const cal = useRef<{ active: boolean; values: number[]; timer: number | null }>({
    active: false,
    values: [],
    timer: null,
  });

  const CAM_CALIBRATION_MS = 1200;
  const cam = useUserMedia({ width: 320, height: 240, facingMode: 'user' });

  // 毎フレーム setState しない：最新値は ref に保持
  const latestMouthRef = useRef<number | null>(null);

  const detector = useGestureDetector(cam.videoRef, {
    mode,
    threshold,
    consecutive: 2,
    deadTimeMs: 300,
    sampleEveryN: 2,
    maxFps: 24,
    onGesture: (kind) => {
      if (kind === mode && armed && !calibrating) onGestureStop?.();
    },
    onScores: (scores) => {
      if ('mouth' in scores) {
        const v = scores.mouth;
        latestMouthRef.current = v;
        if (cal.current.active) cal.current.values.push(v);
      }
    },
  });

  const { ready, running, start, stop } = detector;

  // 再生状態に応じて検出をON/OFF
  useEffect(() => {
    const shouldRun = cam.playing && ready && (calibrating || armed);
    if (shouldRun && !running) start();
    if (!shouldRun && running) stop();
  }, [cam.playing, ready, running, start, stop, calibrating, armed]);

  useEffect(() => {
    if (!cam.playing) return;
    let raf: number | null = null;
    let last = performance.now();
    const tick = (t: number) => {
      if (t - last >= 150) {
        last = t;
        const v = latestMouthRef.current;
        if (v != null) setMouth(v);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [cam.playing]);

  useEffect(() => {
    if (!cam.playing || !ready) return;
    if (cal.current.active) return;

    setCalibrating(true);
    cal.current.active = true;
    cal.current.values = [];

    const calRef = cal.current;

    calRef.timer = window.setTimeout(() => {
      const vals = calRef.values;
      const base = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.1; // 閉口平均の想定
      const newTh = Math.max(0.45, base + 0.25);
      setThreshold(Number(newTh.toFixed(2)));

      calRef.active = false;
      calRef.values = [];
      calRef.timer = null;
      setCalibrating(false);
    }, CAM_CALIBRATION_MS) as unknown as number;

    return () => {
      if (calRef.timer) {
        clearTimeout(calRef.timer);
        calRef.timer = null;
      }
      calRef.active = false;
      calRef.values = [];
    };
  }, [cam.playing, ready]);

  useEffect(() => {
    if (!cam.playing) setCalibrating(false);
  }, [cam.playing]);

  return (
    <div className={hidden ? 'hidden' : ''}>
      <div className="mb-2 flex items-center justify-between">
        <div className="whitespace-nowrap text-sm text-slate-300">
          カメラプレビュー
          {ready ? '' : '（初期化中…）'}
          {calibrating ? '（キャリブ中）' : ''}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-slate-300">
            <input type="checkbox" checked={mirrored} onChange={() => setMirrored((v) => !v)} />
            ミラー表示
          </label>

          {cam.playing ? (
            <button
              className="rounded-md bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
              onClick={cam.stop}
            >
              停止
            </button>
          ) : (
            <button
              className="rounded-md bg-cyan-500 px-2 py-1 text-xs hover:bg-cyan-400"
              onClick={cam.start}
              title="開始後しばらくは口を閉じたまま静止してください"
            >
              カメラ開始
            </button>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-black/20 p-2">
        <video
          ref={cam.videoRef}
          playsInline
          muted
          className={[
            'h-40 w-full transform-gpu rounded-lg bg-black object-cover',
            mirrored ? 'scale-x-[-1]' : '',
          ].join(' ')}
        />
        {/* HUD */}
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-slate-900/70 px-2 py-1 text-xs tabular-nums text-slate-200">
          mouth: {mouth === null ? '—' : mouth.toFixed(2)} / th: {threshold.toFixed(2)}
        </div>
      </div>

      {cam.error && <p className="mt-2 text-xs text-rose-400">エラー: {cam.error}</p>}
      {cam.hasPermission === false && !cam.error && (
        <p className="mt-2 text-xs text-rose-400">
          カメラ権限が拒否されました。ブラウザの設定から許可してください。
        </p>
      )}
    </div>
  );
}
