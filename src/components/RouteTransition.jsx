import { useLocation } from 'react-router-dom';
import PageTransition from './PageTransition';

// The splash supplies its own exit fade, so its destination renders directly
// underneath it. Other route entries keep the normal native-style slide.
export default function RouteTransition({ children }) {
  const location = useLocation();
  if (location.state?.fromSplash) return children;
  return <PageTransition>{children}</PageTransition>;
}