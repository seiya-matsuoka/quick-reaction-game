import { useCallback, useEffect, useRef, useState } from 'react';

type Options = {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
  /** 画面を離れてもストリームを維持 */
  persistAcrossUnmounts?: boolean;
};

export type CameraState = {
  videoRef: React.RefObject<HTMLVideoElement>;
  start: () => Promise<void>;
  stop: () => void;
  playing: boolean;
  hasPermission: boolean | null; // null: 未判定 / true: 許可 / false: 拒否
  error: string | null;
};

// アプリ内で使い回す共有ストリーム（常時オン運用）
let sharedStream: MediaStream | null = null;

function attachVideo(video: HTMLVideoElement, stream: MediaStream) {
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  void video.play().catch(() => {});
}

export function useUserMedia(opts: Options = {}): CameraState {
  const { width = 320, height = 240, facingMode = 'user', persistAcrossUnmounts = true } = opts;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    try {
      setError(null);

      if (sharedStream) {
        const v = videoRef.current;
        if (v) attachVideo(v, sharedStream);
        setPlaying(true);
        setHasPermission(true);
        return;
      }

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode,
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (persistAcrossUnmounts) {
        sharedStream = stream;
      }

      const v = videoRef.current;
      if (v) attachVideo(v, stream);
      setPlaying(true);
      setHasPermission(true);
    } catch (e) {
      console.error('[useUserMedia] start error:', e);
      setError((e as Error)?.message ?? 'getUserMedia failed');
      setHasPermission(false);
      setPlaying(false);
    }
  }, [width, height, facingMode, persistAcrossUnmounts]);

  const stop = useCallback(() => {
    try {
      if (sharedStream) {
        for (const track of sharedStream.getTracks()) track.stop();
        sharedStream = null;
      }
      const v = videoRef.current;
      if (v) {
        v.pause();
        v.srcObject = null;
      }
      setPlaying(false);
    } catch (e) {
      console.error('[useUserMedia] stop error:', e);
    }
  }, []);

  // マウント時：共有ストリームがあれば自動で再アタッチ
  useEffect(() => {
    if (sharedStream) {
      const v = videoRef.current;
      if (v) {
        attachVideo(v, sharedStream);
        setPlaying(true);
        setHasPermission(true);
      }
    }
  }, []);

  // アンマウント時：永続モードなら停止せずデタッチのみ
  useEffect(() => {
    const el = videoRef.current;
    return () => {
      if (el) {
        el.pause();
        (el as any).srcObject = null;
      }
      if (!persistAcrossUnmounts && sharedStream) {
        for (const track of sharedStream.getTracks()) track.stop();
        sharedStream = null;
      }
    };
  }, [persistAcrossUnmounts]);

  // RefObject として返す（読み取り専用用途）
  return {
    videoRef: videoRef as unknown as React.RefObject<HTMLVideoElement>,
    start,
    stop,
    playing,
    hasPermission,
    error,
  };
}
