import { useEffect, useRef, useState } from 'react';
import { useUserMedia } from '@/hooks/useUserMedia';
import { useGestureDetector } from '@/hooks/useGestureDetector';

type Props = {
  hidden?: boolean;
  mode?: 'mouth' | 'blink';
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
  const [score, setScore] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<number>(thresholdDefault);
  const [calibrating, setCalibrating] = useState(false);

  // セッション内（リロード中は持続しない）での閾値ストア
  const getThresholdStore = () =>
    ((globalThis as any).CAMERA_THRESHOLD_BY_MODE ??= {} as Record<'mouth' | 'blink', number>);

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

  // カメラは常時オン
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
  const latestScoreRef = useRef<number | null>(null);
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
      const key = mode === 'mouth' ? 'mouth' : 'blink';
      if (key in scores) {
        const v = scores[key]!;
        latestScoreRef.current = v;
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

  // モード変更時はしきい値とバッファを初期化（再キャリブ前提に戻す）
  useEffect(() => {
    const store = getThresholdStore();
    const stored = typeof store[mode] === 'number' ? store[mode] : undefined;

    setThreshold(stored ?? thresholdDefault); // ← 保存優先、なければ 0.5

    setCalibrating(false);
    latestScoreRef.current = null;

    const calRef = cal.current;
    if (calRef.timer) {
      clearTimeout(calRef.timer);
      calRef.timer = null;
    }
    calRef.active = false;
    calRef.values = [];
    lastCalNonceRef.current = undefined;
  }, [mode, thresholdDefault]);

  useEffect(() => {
    if (!cam.playing) return;
    let raf: number | null = null;
    let last = performance.now();
    const tick = (t: number) => {
      if (t - last >= 150) {
        last = t;
        const v = latestScoreRef.current;
        if (v != null) setScore(v);
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
    if (!playingRef.current || !readyRef.current) return;
    if (lastCalNonceRef.current === token) return;
    lastCalNonceRef.current = token;

    const calRef = cal.current;
    if (calRef.active) return;

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

      // blink と mouth で下限とオフセットを分ける（mouth をやや甘く）
      const FLOOR = mode === 'blink' ? 0.4 : 0.4;
      const OFFSET = mode === 'blink' ? 0.25 : 0.2;
      const newTh = Math.max(FLOOR, base + OFFSET);
      setThreshold(Number(newTh.toFixed(2)));

      // モード別に保存（セッション内のみ有効）
      const store = getThresholdStore();
      store[mode] = Number(newTh.toFixed(2));

      calRef.active = false;
      calRef.values = [];
      calRef.timer = null;
      setCalibrating(false);
      onCalibratedRef.current?.();
    };

    calRef.timer = window.setTimeout(done, CAL_MS) as unknown as number;

    return () => {
      if (calRef.timer) {
        clearTimeout(calRef.timer);
        calRef.timer = null;
      }
      calRef.active = false;
      calRef.values = [];
      setCalibrating(false);
    };
  }, [calibrateNonce, mode]);

  useEffect(() => {
    if (!cam.playing) setCalibrating(false);
  }, [cam.playing]);

  const label = mode === 'mouth' ? 'mouth' : 'blink';

  return (
    <div className={hidden ? 'hidden' : ''}>
      <div className="mb-2 flex items-center justify-between">
        <div className="whitespace-nowrap text-sm text-slate-300">カメラプレビュー</div>
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
          {label}: {score === null ? '—' : score.toFixed(2)} / th: {threshold.toFixed(2)}
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
