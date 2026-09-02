import { useEffect, useState } from 'react';
import { markHintSeen, wasHintSeen } from './hints';

export const useHomeHints = (loaded: boolean, itemCount: number) => {
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [showPinchHint, setShowPinchHint] = useState(false);
  const [showSelectHint, setShowSelectHint] = useState(false);

  useEffect(() => {
    if (!loaded || itemCount === 0) return;
    void (async () => {
      if (!(await wasHintSeen('home-swipe-filter'))) {
        setShowSwipeHint(true);
        await markHintSeen('home-swipe-filter');
      }
    })();
  }, [loaded, itemCount]);

  useEffect(() => {
    if (!loaded || itemCount === 0) return;
    void (async () => {
      if (!(await wasHintSeen('grid-long-press-select'))) {
        const t = setTimeout(async () => {
          setShowSelectHint(true);
          await markHintSeen('grid-long-press-select');
        }, 30000);
        return () => clearTimeout(t);
      }
    })();
  }, [loaded, itemCount]);

  useEffect(() => {
    if (!loaded || itemCount === 0) return;
    if (showSwipeHint) return;
    void (async () => {
      if (!(await wasHintSeen('home-pinch-zoom'))) {
        const t = setTimeout(async () => {
          setShowPinchHint(true);
          await markHintSeen('home-pinch-zoom');
        }, 4000);
        return () => clearTimeout(t);
      }
    })();
  }, [loaded, itemCount, showSwipeHint]);

  return {
    showSwipeHint, setShowSwipeHint,
    showPinchHint, setShowPinchHint,
    showSelectHint, setShowSelectHint,
  };
};
