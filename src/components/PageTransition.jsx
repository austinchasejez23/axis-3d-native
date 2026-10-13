import { motion } from 'framer-motion';

// Native-style push/pop slide between full-screen routes. `fade` swaps the
// slide for a slow cross-fade (used when arriving from the splash screen).
export default function PageTransition({ children, fade = false }) {
  return (
    <motion.div
      className="fixed inset-0 bg-black"
      initial={fade ? { opacity: 0 } : { opacity: 0, x: 24 }}
      animate={fade ? { opacity: 1 } : { opacity: 1, x: 0 }}
      exit={fade ? { opacity: 0 } : { opacity: 0, x: -24 }}
      transition={{ duration: fade ? 3 : 0.22, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}