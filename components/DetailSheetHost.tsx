import {
  BottomSheetBackdrop,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenshotDetail } from './ScreenshotDetail';
import { useColors } from '@/lib/themeContext';
import type { LocalScreenshot } from '@/lib/uploads';

export type DetailSheetHostHandle = {
  present: (id: string) => void;
  dismiss: () => void;
};

type Props = {
  items: LocalScreenshot[];
  /** Apply a patch to the currently-open screenshot. */
  onItemChange: (id: string, patch: Partial<LocalScreenshot>) => void;
  /** Delete the currently-open screenshot. */
  onItemDelete: (id: string) => void;
  /** When true, hide the parallax image header (used by 1-col intent mode). */
  hideImage?: boolean;
  /** Lets the parent know whether the sheet is open — used by the Android
   *  back-handler to know whether to dismiss the sheet first. */
  onOpenChange?: (open: boolean) => void;
};

/**
 * Owns the BottomSheetModal config + ScreenshotDetail rendering.
 *
 * Was duplicated across app/index.tsx and app/library.tsx with the same
 * snap points, backdrop, insets, dismiss/onChange handlers, and prev/next
 * navigation. Now lives in one place — fixes mean fixes-everywhere.
 *
 * Edge-to-edge nav fix: bottomInset is 0 (sheet paints to the very bottom
 * of the screen including under the gesture nav), and the inner scroll
 * pads itself by insets.bottom so footer + chips stay above the nav. This
 * keeps the parchment background under the nav instead of the dimmed grid
 * bleeding through the translucent system bar.
 */
export const DetailSheetHost = forwardRef<DetailSheetHostHandle, Props>(
  function DetailSheetHost(
    { items, onItemChange, onItemDelete, hideImage, onOpenChange },
    ref,
  ) {
    const c = useColors();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['60%', '85%', '100%'], []);
    // Open fully expanded by default. With a smaller initial snap (60%/85%),
    // scroll on content is partially capped because gorhom interprets
    // drag-up at content-top as 'expand sheet to next snap'. Opening at
    // 100% sidesteps that — content scrolls normally from the start, and
    // the user can drag the handle DOWN to peek/dismiss.
    const initialSnapIndex = 2;
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [sheetIndex, setSheetIndex] = useState(0);

    useImperativeHandle(
      ref,
      () => ({
        present: (id: string) => {
          setSelectedId(id);
          sheetRef.current?.present();
          onOpenChange?.(true);
        },
        dismiss: () => {
          sheetRef.current?.dismiss();
        },
      }),
      [onOpenChange],
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
      ),
      [],
    );

    const selected = selectedId ? items.find((it) => it.id === selectedId) ?? null : null;
    const selectedIndex = selected ? items.findIndex((it) => it.id === selected.id) : -1;

    const goPrev = useCallback(() => {
      if (selectedIndex <= 0) return;
      setSelectedId(items[selectedIndex - 1].id);
    }, [items, selectedIndex]);
    const goNext = useCallback(() => {
      if (selectedIndex < 0 || selectedIndex >= items.length - 1) return;
      setSelectedId(items[selectedIndex + 1].id);
    }, [items, selectedIndex]);

    const onPatch = useCallback(
      (patch: Partial<LocalScreenshot>) => {
        if (!selectedId) return;
        onItemChange(selectedId, patch);
      },
      [selectedId, onItemChange],
    );

    const onDelete = useCallback(() => {
      if (!selectedId) return;
      sheetRef.current?.dismiss();
      onItemDelete(selectedId);
    }, [selectedId, onItemDelete]);

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        index={initialSnapIndex}
        // Disable content-pan-claims-sheet-drag. With it ON (default),
        // gorhom's pan handler races with BottomSheetScrollView's pan and
        // caps inner scroll travel so the sheet can transition between
        // snaps via content drag. Disabling it means the inner scroll is
        // free — drag content up/down ALWAYS scrolls; sheet snaps change
        // only via the handle.
        enableContentPanningGesture={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.parchment }}
        handleIndicatorStyle={{ backgroundColor: c.inkMuted }}
        onDismiss={() => {
          setSelectedId(null);
          onOpenChange?.(false);
        }}
        onChange={(idx) => setSheetIndex(idx < 0 ? 0 : idx)}
        // bottomInset=0: sheet's parchment background paints all the way
        // down to the physical bottom of the screen, INCLUDING under the
        // translucent gesture nav. That's the industry-standard look —
        // the system bar shows the sheet's content underneath, not the
        // page underneath the sheet. ScreenshotDetail compensates with
        // a paddingBottom that keeps the actual content above the nav
        // indicator's visual zone.
        bottomInset={0}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        {selected && (
          <ScreenshotDetail
            item={selected}
            onChange={onPatch}
            onDelete={onDelete}
            snapIndex={sheetIndex}
            onPrev={selectedIndex > 0 ? goPrev : undefined}
            onNext={
              selectedIndex >= 0 && selectedIndex < items.length - 1 ? goNext : undefined
            }
            hideImage={hideImage}
            allItems={items}
            onSelect={(id) => setSelectedId(id)}
          />
        )}
      </BottomSheetModal>
    );
  },
);
