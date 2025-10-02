import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = {
  videoRef: React.RefObject<HTMLVideoElement>;
  start: () => Promise<void>;
  stop: () => void;
  playing: boolean;
  hasPermission: boolean | null;
  error: string | null;
};

type Options = {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
};

export function useUserMedia(opts: Options = {}): CameraState {
  const { width = 320, height = 240, facingMode = 'user' } = opts;

  const videoRef = useRef<HTMLVideoElement>(null!);

  const streamRef = useRef<MediaStream | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const start = useCallback(async () => {
    try {
      setError(null);
      stopTracks();

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setHasPermission(true);

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
        setPlaying(true);
      }
    } catch (e) {
      console.error(e);
      setHasPermission(false);
      setError((e as Error).message ?? 'getUserMedia failed');
      setPlaying(false);
      stopTracks();
      const v = videoRef.current;
      if (v) {
        v.pause();
        v.srcObject = null;
      }
    }
  }, [width, height, facingMode]);

  const stop = useCallback(() => {
    setPlaying(false);
    stopTracks();
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
    }
  }, []);

  // アンマウント時は必ず停止
  useEffect(() => () => stop(), [stop]);

  return { videoRef, start, stop, playing, hasPermission, error };
}
