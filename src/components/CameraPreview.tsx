import { useState } from 'react';
import { useUserMedia } from '@/hooks/useUserMedia';

type Props = {
  hidden?: boolean; // プレビュー非表示切替
};

export default function CameraPreview({ hidden }: Props) {
  const [mirrored, setMirrored] = useState(true);
  const cam = useUserMedia({ width: 320, height: 240, facingMode: 'user' });

  return (
    <div className={hidden ? 'hidden' : ''}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-slate-300">カメラプレビュー</div>
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
            >
              カメラ開始
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-black/20 p-2">
        <video
          ref={cam.videoRef}
          playsInline
          muted
          className={[
            'h-40 w-full rounded-lg bg-black object-cover',
            mirrored ? 'scale-x-[-1]' : '',
          ].join(' ')}
        />
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
