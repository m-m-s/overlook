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
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.parchment }}
        handleIndicatorStyle={{ backgroundColor: c.inkMuted }}
        onDismiss={() => {
          setSelectedId(null);
          onOpenChange?.(false);
        }}
        onChange={(idx) => setSheetIndex(idx < 0 ? 0 : idx)}
        // bottomInset=insets.bottom: sheet ends ABOVE the gesture nav.
        // Trades parchment-under-nav (slight grid bleed-through visible
        // through the translucent system bar) for predictable scroll
        // boundaries — content's last item naturally lands above the
        // nav without manual paddingBottom math.
        bottomInset={insets.bottom}
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
