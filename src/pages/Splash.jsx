import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const VIDEO_URL = '/splash/axis_splash_v4.mp4';
// A video with no poster draws the browser's own huge grey play button until
// its first frame decodes, which in the native app covers the whole screen for
// a moment. A 1x1 black poster fills that gap with the background instead.
const CREDIT_URL = '/media/first_app_production_credit.png';
// The "A First App Production" credit fades in at 4s and out with the
// video's own fade to black (from 5.5s), timed against the video itself.
const CREDIT_IN_S = 4;
const CREDIT_OUT_S = 5.5;
const BLANK_POSTER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export default function Splash() {
  const navigate = useNavigate();
  const [creditIn, setCreditIn] = useState(false);
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
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setCreditIn(t >= CREDIT_IN_S && t < CREDIT_OUT_S);
        }}
        onEnded={leave}
        onError={leave}
      />
      <div
        className="pointer-events-none absolute bottom-6 left-0 right-0 z-10 flex justify-center transition-opacity ease-out"
        style={{ opacity: creditIn ? 1 : 0, transitionDuration: creditIn ? '700ms' : '400ms' }}
      >
        <img src={CREDIT_URL} alt="A First App Production" className="block h-auto w-[52vw] max-w-[220px]" />
      </div>
    </div>
  );
}