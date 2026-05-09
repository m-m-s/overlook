import { Modal, Text, View } from 'react-native';

import { ZoomableImage } from '../ZoomableImage';
import { useColors } from '@/lib/themeContext';

type Props = {
  visible: boolean;
  uri: string;
  onClose: () => void;
};

/**
 * Fullscreen pinch-to-zoom + pan view for a single screenshot. Triggered
 * by tap-on-image at full sheet snap, or pinch-out on the in-sheet header
 * image. Tap (no pan) closes.
 */
export const Lightbox = ({ visible, uri, onClose }: Props) => {
  const c = useColors();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Dropped the swipe-to-close gesture: nesting GestureHandlerRootView
          inside the Modal crashed on Android, and RNGH gestures don't
          propagate from the app's outer root into Modal children. Tap and
          the X button cover dismissal. */}
      <ZoomableImage uri={uri} onClose={onClose} />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          alignItems: 'center',
          paddingBottom: 24,
        }}
      >
        <Text
          style={{
            color: c.parchment,
            fontSize: 11,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            opacity: 0.6,
          }}
        >
          Tap to close
        </Text>
      </View>
    </Modal>
  );
};
