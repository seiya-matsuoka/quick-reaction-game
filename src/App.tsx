import { useState } from 'react';

type Page = 'home' | 'measure' | 'result';

export default function App() {
  const [page, setPage] = useState<Page>('home');
  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100">
      {page === 'home' && (
        <div className="mx-auto max-w-sm p-6">
          <h1 className="mb-4 text-2xl font-bold">Quick Reaction Game</h1>
          <p className="mb-6 text-slate-300">合図に反応して ms を測る。</p>
          <button
            className="w-full rounded-2xl bg-cyan-500 px-4 py-3 font-semibold hover:bg-cyan-400"
            onClick={() => setPage('measure')}
          >
            計測をはじめる
          </button>
        </div>
      )}
      {page === 'measure' && (
        <div className="mx-auto max-w-sm p-6">
          <h2 className="mb-4 text-xl font-semibold">計測画面</h2>
          <div className="rounded-2xl border border-slate-700 p-6 text-slate-300">合図ゾーン</div>
          <div className="mt-6 flex gap-3">
            <button
              className="flex-1 rounded-2xl bg-slate-700 px-4 py-3 hover:bg-slate-600"
              onClick={() => setPage('home')}
            >
              ホームへ
            </button>
            <button
              className="flex-1 rounded-2xl bg-cyan-500 px-4 py-3 hover:bg-cyan-400"
              onClick={() => setPage('result')}
            >
              結果へ
            </button>
          </div>
        </div>
      )}
      {page === 'result' && (
        <div className="mx-auto max-w-sm p-6">
          <h2 className="mb-4 text-xl font-semibold">結果</h2>
          <div className="rounded-2xl border border-slate-700 p-6 text-slate-300">
            最小：— ms / 平均：— ms
          </div>
          <div className="mt-6 flex gap-3">
            <button
              className="flex-1 rounded-2xl bg-slate-700 px-4 py-3 hover:bg-slate-600"
              onClick={() => setPage('home')}
            >
              ホームへ
            </button>
            <button
              className="flex-1 rounded-2xl bg-cyan-500 px-4 py-3 hover:bg-cyan-400"
              onClick={() => setPage('measure')}
            >
              もう一度
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
