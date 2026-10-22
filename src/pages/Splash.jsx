import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const VIDEO_URL = '/splash/axis_splash_v4.mp4';
// A video with no poster draws the browser's own huge grey play button until
// its first frame decodes, which in the native app covers the whole screen for
// a moment. A 1x1 black poster fills that gap with the background instead.
const BLANK_POSTER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export default function Splash() {
  const navigate = useNavigate();
  const leave = useCallback(() => navigate('/library', { replace: true, state: { fromSplash: true } }), [navigate]);

  useEffect(() => {
    // Keep startup usable if playback stalls or autoplay is unavailable.
    const timeout = setTimeout(leave, 30000);
    return () => clearTimeout(timeout);
  }, [leave]);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black">
      <video
        src={VIDEO_URL}
        autoPlay
        muted
        playsInline
        preload="auto"
        poster={BLANK_POSTER}
        className="h-full w-full bg-black object-contain"
        aria-label="AXIS splash animation"
        onEnded={leave}
        onError={leave}
      />
    </div>
  );
}