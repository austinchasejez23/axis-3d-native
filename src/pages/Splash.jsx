import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const VIDEO_URL = '/splash/axis_splash_v3.mp4';
// A video with no poster draws the browser's own huge grey play button until
// its first frame decodes, which in the native app covers the whole screen for
// a moment. A 1x1 black poster fills that gap with the background instead.
const BLANK_POSTER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const CREDIT_URL = '/media/4557d27b8_Picsart_26-08-20_14-42-35-065.jpg';
const CREDIT_AT_MS = 4000;

export default function Splash() {
  const navigate = useNavigate();
  const [creditIn, setCreditIn] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setCreditIn(true), CREDIT_AT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (videoEnded) navigate('/library', { replace: true, state: { fromSplash: true } });
  }, [videoEnded, navigate]);

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black"
      initial={{ backgroundColor: '#000000' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="axis-splash-video-fade relative aspect-video w-[195vmin] shrink-0">
        <video
          src={VIDEO_URL}
          autoPlay
          muted
          playsInline
          preload="auto"
          poster={BLANK_POSTER}
          className="absolute inset-0 h-full w-full bg-black object-contain"
          aria-label="AXIS splash animation"
          onEnded={() => setVideoEnded(true)}
          onError={() => setVideoEnded(true)}
        />
      </div>

      <div
        className="absolute bottom-6 left-0 right-0 z-20 flex justify-center transition-opacity ease-out"
        style={{ opacity: creditIn ? 1 : 0, transitionDuration: '700ms' }}
      >
        <img src={CREDIT_URL} alt="A First App Production" className="block h-auto w-[52vw] max-w-[220px]" />
      </div>
    </motion.div>
  );
}