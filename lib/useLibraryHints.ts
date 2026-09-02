import { useEffect, useRef, useState } from 'react';
import { markHintSeen, wasHintSeen } from './hints';

export const useLibraryHints = (itemCount: number, cols: number) => {
  const [showLibraryPinchHint, setShowLibraryPinchHint] = useState(false);
  const [showSelectHint, setShowSelectHint] = useState(false);
  const [showIntentHint, setShowIntentHint] = useState(false);
  const prevCount = useRef(itemCount);

  useEffect(() => {
    if (prevCount.current === 0 && itemCount > 0) {
      void (async () => {
        if (!(await wasHintSeen('library-pinch-zoom'))) {
          setShowLibraryPinchHint(true);
          await markHintSeen('library-pinch-zoom');
        }
      })();
    }
    prevCount.current = itemCount;
  }, [itemCount]);

  useEffect(() => {
    if (itemCount === 0) return;
    void (async () => {
      if (!(await wasHintSeen('grid-long-press-select'))) {
        const t = setTimeout(async () => {
          setShowSelectHint(true);
          await markHintSeen('grid-long-press-select');
        }, 30000);
        return () => clearTimeout(t);
      }
    })();
  }, [itemCount]);

  useEffect(() => {
    if (cols !== 1) return;
    void (async () => {
      if (!(await wasHintSeen('intent-mode'))) {
        setShowIntentHint(true);
        await markHintSeen('intent-mode');
      }
    })();
  }, [cols]);

  return {
    showLibraryPinchHint, setShowLibraryPinchHint,
    showSelectHint, setShowSelectHint,
    showIntentHint, setShowIntentHint,
  };
};
