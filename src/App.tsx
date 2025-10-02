import { useEffect, useMemo, useState } from 'react';
import { useReactionTap } from '@/hooks/useReactionTap';
import type { SessionSummary } from '@/types/reaction';
import CameraPreview from '@/components/CameraPreview';

type Page = 'home' | 'measure' | 'result';
type InputMode = 'tap' | 'camera';

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [lastSummary, setLastSummary] = useState<SessionSummary | null>(null);
  const [totalTrials, setTotalTrials] = useState<number>(1);
  const [inputMode, setInputMode] = useState<InputMode>('tap');

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100">
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
}: {
  totalTrials: number;
  onChangeTrials: (n: number) => void;
  inputMode: 'tap' | 'camera';
  onChangeInputMode: (m: 'tap' | 'camera') => void;
  onStart: () => void;
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
}: {
  totalTrials: number;
  inputMode: 'tap' | 'camera';
  onAbort: () => void;
  onFinish: (summary: SessionSummary) => void;
}) {
  const { stage, trialIndex, remaining, stats, start, react, summary } = useReactionTap({
    totalTrials,
    minDelayMs: 1500,
    maxDelayMs: 4000,
    cooldownMs: 120,
  });

  // 初回マウントで自動スタート
  useEffect(() => {
    start();
  }, [start]);

  // スペース or Enter で反応
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        react();
      }
      if (e.code === 'Escape') onAbort();
    };
    window.addEventListener('keydown', onKey, { passive: false });
    return () => window.removeEventListener('keydown', onKey);
  }, [react, onAbort]);

  // 完了時に親へ通知
  useEffect(() => {
    if (summary) onFinish(summary);
  }, [summary, onFinish]);

  const zone = useMemo(() => {
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
  }, [stage]);

  const single = totalTrials === 1;

  return (
    <div className="mx-auto max-w-sm p-6">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          計測（{single ? `${totalTrials} 回` : `連続 ${totalTrials} 回`}）
        </h2>
        <button
          className="rounded-xl bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600"
          onClick={onAbort}
        >
          中断
        </button>
      </header>

      {/* カメラモードならプレビュー表示 */}
      {inputMode === 'camera' && (
        <div className="mb-4">
          <CameraPreview />
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

      {/* 合図ゾーン（クリック/タップで反応） */}
      <button
        type="button"
        onPointerDown={react}
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
        画面タップ / スペース / Enter で反応。
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
