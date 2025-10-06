import { useEffect, useMemo, useState, useRef } from 'react';
import { useReactionTap } from '@/hooks/useReactionTap';
import type { SessionSummary } from '@/types/reaction';
import CameraPreview from '@/components/CameraPreview';

type Page = 'home' | 'measure' | 'result';
type InputMode = 'tap' | 'camera';
type CameraKind = 'mouth' | 'blink';

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [lastSummary, setLastSummary] = useState<SessionSummary | null>(null);
  const [totalTrials, setTotalTrials] = useState<number>(1);
  const [inputMode, setInputMode] = useState<InputMode>('tap');
  const [cameraKind, setCameraKind] = useState<CameraKind>('mouth');

  return (
    <div className="min-h-dvh overflow-hidden bg-slate-900 text-slate-100">
      {page === 'home' && (
        <Home
          totalTrials={totalTrials}
          onChangeTrials={setTotalTrials}
          inputMode={inputMode}
          onChangeInputMode={setInputMode}
          onStart={() => {
            setLastSummary(null);
            setPage('measure');
          }}
          cameraKind={cameraKind}
          onChangeCameraKind={setCameraKind}
        />
      )}

      {page === 'measure' && (
        <MeasureTap
          totalTrials={totalTrials}
          inputMode={inputMode}
          onAbort={() => setPage('home')}
          onFinish={(sum) => {
            setLastSummary(sum);
            setPage('result');
          }}
          cameraKind={cameraKind}
        />
      )}

      {page === 'result' && (
        <Result
          summary={lastSummary}
          onRetry={() => setPage('measure')}
          onHome={() => setPage('home')}
        />
      )}
    </div>
  );
}

/* ---------- Home ---------- */
function Home({
  totalTrials,
  onChangeTrials,
  inputMode,
  onChangeInputMode,
  onStart,
  cameraKind,
  onChangeCameraKind,
}: {
  totalTrials: number;
  onChangeTrials: (n: number) => void;
  inputMode: 'tap' | 'camera';
  onChangeInputMode: (m: 'tap' | 'camera') => void;
  onStart: () => void;
  cameraKind: CameraKind;
  onChangeCameraKind: (k: CameraKind) => void;
}) {
  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="mb-2 text-2xl font-bold">Quick Reaction Game</h1>
      <p className="mb-4 text-slate-300">合図に反応して ms を測る。</p>

      {/* 入力モード */}
      <div className="mb-4 rounded-2xl border border-slate-700 p-4">
        <label className="mb-2 block text-sm text-slate-300">入力モード</label>
        <select
          className="w-full rounded-xl bg-slate-800 p-2"
          value={inputMode}
          onChange={(e) => onChangeInputMode(e.target.value as 'tap' | 'camera')}
        >
          <option value="tap">タップ（画面/クリック/スペース）</option>
          <option value="camera">カメラ（プレビューのみ）</option>
        </select>
      </div>

      {/* 検知対象（カメラ選択時のみ） */}
      {inputMode === 'camera' && (
        <div className="mb-4 rounded-2xl border border-slate-700 p-4">
          <label className="mb-2 block text-sm text-slate-300">検知対象</label>
          <select
            className="w-full rounded-xl bg-slate-800 p-2"
            value={cameraKind}
            onChange={(e) => onChangeCameraKind(e.target.value as CameraKind)}
          >
            <option value="mouth">口の開き</option>
            <option value="blink">まばたき</option>
          </select>
        </div>
      )}

      {/* プレイ回数 */}
      <div className="mb-5 rounded-2xl border border-slate-700 p-4">
        <label className="mb-2 block text-sm text-slate-300">プレイ回数</label>
        <select
          className="w-full rounded-xl bg-slate-800 p-2"
          value={totalTrials}
          onChange={(e) => onChangeTrials(Number(e.target.value))}
        >
          <option value={1}>1</option>
          <option value={3}>3</option>
          <option value={5}>5</option>
          <option value={10}>10</option>
        </select>
      </div>

      <button
        className="w-full rounded-2xl bg-cyan-500 px-4 py-3 font-semibold hover:bg-cyan-400"
        onClick={onStart}
      >
        はじめる
      </button>
    </div>
  );
}

/* ---------- MeasureTap ---------- */
function MeasureTap({
  totalTrials,
  inputMode,
  onAbort,
  onFinish,
  cameraKind,
}: {
  totalTrials: number;
  inputMode: 'tap' | 'camera';
  onAbort: () => void;
  onFinish: (summary: SessionSummary) => void;
  cameraKind: 'mouth' | 'blink';
}) {
  const { stage, trialIndex, remaining, stats, start, react, summary } = useReactionTap({
    totalTrials,
    minDelayMs: 1500,
    maxDelayMs: 4000,
    cooldownMs: 100,
  });

  // タップモードは自動開始
  useEffect(() => {
    if (inputMode === 'tap') start();
  }, [inputMode, start]);

  // --- カメラ用の状態 ---
  const [hasStarted, setHasStarted] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [camCalibrating, setCamCalibrating] = useState(false);
  const [camPlaying, setCamPlaying] = useState(false);

  const [cameraCalibrated, setCameraCalibrated] = useState<boolean>(
    Boolean((globalThis as any).CAMERA_CALIBRATED_MODE?.[cameraKind])
  );

  // 「カメラの設定」トリガ（CameraPreview へ渡す）
  const [calibrateNonce, setCalibrateNonce] = useState(0);
  const requestCalibrate = () => setCalibrateNonce((n) => n + 1);

  // 受付済み（ready待ち含む）を可視化するフラグ
  const [pendingCalibrate, setPendingCalibrate] = useState(false);

  useEffect(() => {
    const map = ((globalThis as any).CAMERA_CALIBRATED_MODE ??= {});
    const isCalibratedForMode = Boolean(map[cameraKind]);
    setCameraCalibrated(isCalibratedForMode);
    setPendingCalibrate(false); // 「キャリブ待機」表示等をリセット
  }, [cameraKind]);

  // キー操作（準備前でもキャリブは「予約」だけ通す → 実行は CameraPreview 側で ready 待ち）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (inputMode === 'camera' && !hasStarted) {
          if (!cameraCalibrated) {
            if (e.repeat) return;
            // camPlaying/camReady を条件にしない：先に予約し、実行は下の useEffect で
            if (!camCalibrating) {
              requestCalibrate();
              setPendingCalibrate(true);
            }
          } else {
            // 計測開始は ready を見て開始
            if (camReady && !camCalibrating) {
              start();
              setHasStarted(true);
            }
          }
        } else {
          react();
        }
      }
      if (e.code === 'Escape') onAbort();
    };
    window.addEventListener('keydown', onKey, { passive: false });
    return () => window.removeEventListener('keydown', onKey);
  }, [inputMode, hasStarted, cameraCalibrated, camReady, camCalibrating, start, react, onAbort]);

  // ready 到達時に、予約済みキャリブを自動再トリガ
  useEffect(() => {
    if (
      inputMode === 'camera' &&
      pendingCalibrate &&
      !cameraCalibrated &&
      camReady && // ここだけを見る（playing は CameraPreview 側で担保済み）
      !camCalibrating
    ) {
      requestCalibrate(); // 実行トリガをもう一度確実に送る
      setPendingCalibrate(false);
    }
  }, [inputMode, pendingCalibrate, cameraCalibrated, camReady, camCalibrating]);

  // 完了時：キャリブ状態は維持（同セッション内は再キャリブ不要）
  useEffect(() => {
    if (summary) {
      setHasStarted(false);
      onFinish(summary);
    }
  }, [summary, onFinish]);

  // 合図後の自動タイムアウト（高負荷の上限を制御）
  const GO_AUTO_TIMEOUT_MS = 10000;
  const goTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (goTimerRef.current) {
      clearTimeout(goTimerRef.current);
      goTimerRef.current = null;
    }
    if (stage === 'go') {
      goTimerRef.current = window.setTimeout(() => {
        react();
      }, GO_AUTO_TIMEOUT_MS) as unknown as number;
    }
    return () => {
      if (goTimerRef.current) {
        clearTimeout(goTimerRef.current);
        goTimerRef.current = null;
      }
    };
  }, [stage, react]);

  // ゾーン表示：初回は「カメラの設定」→ 予約中/キャリブ中 →（モデル準備中）→「タップで開始」
  const zone = useMemo(() => {
    if (inputMode === 'camera' && !hasStarted) {
      if (!camPlaying) return { color: 'bg-slate-700', label: 'カメラ準備中…' };
      if (!cameraCalibrated) {
        if (camCalibrating)
          return {
            color: 'bg-slate-700',
            label:
              cameraKind === 'mouth'
                ? 'キャリブ中…（口を閉じて静止）'
                : 'キャリブ中…（目を開けたまま静止）',
          };
        if (pendingCalibrate && !camReady)
          return { color: 'bg-slate-700', label: 'モデル準備中…（キャリブ待機）' };
        if (pendingCalibrate && camReady)
          return { color: 'bg-slate-700', label: 'キャリブ開始中…' };
        return {
          color: 'bg-emerald-600',
          label:
            cameraKind === 'mouth'
              ? 'タップでカメラの設定（口を閉じて静止）'
              : 'タップでカメラの設定（目を開けたまま静止）',
        };
      }
      if (!camReady) return { color: 'bg-slate-700', label: 'モデル準備中…' };
      return { color: 'bg-emerald-600', label: 'タップで開始' };
    }
    switch (stage) {
      case 'waiting':
        return { color: 'bg-amber-500', label: '合図待ち…' };
      case 'go':
        return { color: 'bg-cyan-500', label: '今！' };
      case 'tooSoon':
        return { color: 'bg-rose-500', label: '早すぎ！' };
      default:
        return { color: 'bg-slate-700', label: '準備中…' };
    }
  }, [
    inputMode,
    hasStarted,
    cameraCalibrated,
    camCalibrating,
    camPlaying,
    camReady,
    pendingCalibrate,
    stage,
    cameraKind,
  ]);

  const single = totalTrials === 1;

  return (
    <div className="mx-auto max-w-sm p-6">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          計測（{single ? `${totalTrials} 回` : `連続 ${totalTrials} 回`}）
        </h2>
        <button
          className="rounded-xl bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600"
          onClick={() => {
            setHasStarted(false);
            onAbort();
          }}
        >
          中断
        </button>
      </header>

      {inputMode === 'camera' && (
        <div className="mb-4">
          <CameraPreview
            mode={cameraKind}
            armed={stage === 'go'}
            calibrateNonce={calibrateNonce}
            onCalibrated={() => {
              setCameraCalibrated(true);
              const map = ((globalThis as any).CAMERA_CALIBRATED_MODE ??= {});
              map[cameraKind] = true; // モード別にキャリブ済み記録
              setPendingCalibrate(false);
            }}
            onStatusChange={({ ready, calibrating, playing }) => {
              setCamReady(ready);
              setCamCalibrating(calibrating);
              setCamPlaying(playing);
            }}
            onGestureStop={() => {
              react();
            }}
          />
        </div>
      )}

      <div className="mb-3 text-sm text-slate-300">
        {single ? (
          <span>残り {remaining}</span>
        ) : (
          <span>
            試行 {trialIndex + 1}/{totalTrials}・残り {remaining} ／
            <span className="ml-1">
              最小 {stats.min ?? '—'}ms / 平均 {stats.avg ?? '—'}ms
            </span>
          </span>
        )}
      </div>

      {/* onClick に変更（pointerの差異で取りこぼしが出る環境向け） */}
      <button
        type="button"
        onClick={() => {
          if (inputMode === 'camera' && !hasStarted) {
            if (!cameraCalibrated) {
              if (!camCalibrating) {
                requestCalibrate();
                setPendingCalibrate(true);
              }
            } else if (camReady && !camCalibrating) {
              start();
              setHasStarted(true);
            }
          } else {
            react();
          }
        }}
        className={[
          'group relative grid h-56 w-full place-items-center rounded-2xl transition-colors',
          zone.color,
        ].join(' ')}
      >
        <span className="text-3xl font-bold drop-shadow">{zone.label}</span>
        {stage === 'waiting' && (
          <span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-white/30 [animation:pulse_0.8s_ease-in-out_infinite]" />
        )}
      </button>

      <p className="mt-3 text-xs text-slate-400">
        画面タップ / 画面クリック / スペース / Enter で反応。
        {single
          ? ' 合図前に押すと「早すぎ！」になり、仕切り直します。'
          : ' 合図前に押すと「早すぎ！」になり、同じ試行を仕切り直します。'}
      </p>
    </div>
  );
}

/* ---------- Result ---------- */
function Result({
  summary,
  onRetry,
  onHome,
}: {
  summary: SessionSummary | null;
  onRetry: () => void;
  onHome: () => void;
}) {
  const min = summary?.stats.min ?? null;
  const avg = summary?.stats.avg ?? null;
  const isSingle = (summary?.trials.length ?? 0) <= 1;
  const singleMs = isSingle ? (summary?.trials[0]?.ms ?? null) : null;

  return (
    <div className="mx-auto max-w-sm p-6">
      <h2 className="mb-4 text-xl font-semibold">結果</h2>

      <div className="rounded-2xl border border-slate-700 p-6 text-center">
        {isSingle ? (
          <>
            <div className="mb-2 text-sm text-slate-400">結果</div>
            <div className="text-4xl font-bold">{singleMs ?? '—'} ms</div>
          </>
        ) : (
          <>
            <div className="mb-4 text-sm text-slate-400">{summary?.trials.length ?? 0}回の結果</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-800 p-4">
                <div className="text-xs text-slate-400">最小</div>
                <div className="text-3xl font-bold">{min ?? '—'} ms</div>
              </div>
              <div className="rounded-xl bg-slate-800 p-4">
                <div className="text-xs text-slate-400">平均</div>
                <div className="text-3xl font-bold">{avg ?? '—'} ms</div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          className="flex-1 rounded-2xl bg-cyan-500 px-4 py-3 font-semibold hover:bg-cyan-400"
          onClick={onRetry}
        >
          もう一度
        </button>
        <button
          className="flex-1 rounded-2xl bg-slate-700 px-4 py-3 hover:bg-slate-600"
          onClick={onHome}
        >
          ホームへ
        </button>
      </div>
    </div>
  );
}
