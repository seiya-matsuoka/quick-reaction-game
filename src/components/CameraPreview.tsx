import { useEffect, useRef, useState } from 'react';
import { useUserMedia } from '@/hooks/useUserMedia';
import { useGestureDetector } from '@/hooks/useGestureDetector';

type Props = {
  hidden?: boolean;
  mode?: 'mouth' | 'blink' | 'nod';
  onGestureStop?: () => void;
  thresholdDefault?: number;
  armed?: boolean; // 合図後 true
  onStatusChange?: (s: { ready: boolean; calibrating: boolean; playing: boolean }) => void;
  calibrateNonce?: number; // 1,2,3... に増やすとキャリブ開始。0/undefined は無視
  onCalibrated?: () => void;
};

export default function CameraPreview({
  hidden,
  mode = 'mouth',
  onGestureStop,
  thresholdDefault = 0.5,
  armed = false,
  onStatusChange,
  calibrateNonce,
  onCalibrated,
}: Props) {
  const [mirrored, setMirrored] = useState(true);
  const [mouth, setMouth] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<number>(thresholdDefault);
  const [calibrating, setCalibrating] = useState(false);

  const cal = useRef<{ active: boolean; values: number[]; timer: number | null }>({
    active: false,
    values: [],
    timer: null,
  });
  const lastCalNonceRef = useRef<number | undefined>(undefined);

  const onCalibratedRef = useRef(onCalibrated);
  useEffect(() => {
    onCalibratedRef.current = onCalibrated;
  }, [onCalibrated]);

  // カメラは常時オン（共有ストリームを使い回し）
  const cam = useUserMedia({
    width: 320,
    height: 240,
    facingMode: 'user',
    persistAcrossUnmounts: true,
  });

  const playing = cam.playing;
  const startCam = cam.start;

  useEffect(() => {
    if (!playing) void startCam();
  }, [playing, startCam]);

  const playingRef = useRef(false);
  useEffect(() => {
    playingRef.current = cam.playing;
  }, [cam.playing]);

  // 推論（キャリブ中 or 合図後のみ）
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

  const readyRef = useRef(false);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    onStatusChange?.({ ready, calibrating, playing: cam.playing });
  }, [ready, calibrating, cam.playing, onStatusChange]);

  // 検出は「キャリブ中 or 合図後」だけ回す
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
    const token = calibrateNonce ?? 0;
    if (token <= 0) return;

    // カメラ/モデル準備が未完ならスキップ（App 側が ready 到達で再トリガ）
    if (!playingRef.current || !readyRef.current) return;

    if (lastCalNonceRef.current === token) return;
    lastCalNonceRef.current = token;

    // 進行中なら二重起動しない
    const calRef = cal.current;
    if (calRef.active) return;

    // 前回の残りをクリア
    if (calRef.timer) {
      clearTimeout(calRef.timer);
      calRef.timer = null;
    }

    // 開始
    calRef.active = true;
    calRef.values = [];
    setCalibrating(true);

    const CAL_MS = 1200;
    const done = () => {
      const vals = calRef.values;
      const base = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.1;
      const newTh = Math.max(0.45, base + 0.25);
      setThreshold(Number(newTh.toFixed(2)));

      calRef.active = false;
      calRef.values = [];
      calRef.timer = null;
      setCalibrating(false);
      onCalibratedRef.current?.();
    };

    calRef.timer = window.setTimeout(done, CAL_MS) as unknown as number;

    // 中断/アンマウント時は必ず終了処理
    return () => {
      if (calRef.timer) {
        clearTimeout(calRef.timer);
        calRef.timer = null;
      }
      calRef.active = false;
      calRef.values = [];
      setCalibrating(false);
    };
  }, [calibrateNonce]);

  // カメラ停止でキャリブ表示もオフ
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
