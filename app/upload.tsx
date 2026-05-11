import { Text, View } from 'react-native';

import { UploadDone } from '@/components/upload/UploadDone';
import { UploadPickBatch } from '@/components/upload/UploadPickBatch';
import { UploadProcessing } from '@/components/upload/UploadProcessing';
import { UploadReview } from '@/components/upload/UploadReview';
import { UploadScanning } from '@/components/upload/UploadScanning';
import { useUploadFlow } from '@/lib/useUploadFlow';

export default function UploadScreen() {
  const flow = useUploadFlow();

  if (!flow.session) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text>Sign in to import screenshots from your library.</Text>
      </View>
    );
  }

  if (flow.phase === 'idle' || flow.phase === 'scanning') {
    return <UploadScanning scanProgress={flow.scanProgress} />;
  }

  if (flow.phase === 'pick-batch') {
    return (
      <UploadPickBatch
        newCount={flow.newAssets.length}
        duplicateCount={flow.duplicates.size}
        totalCount={flow.allAssets.length}
        batchSize={flow.batchSize}
        setBatchSize={flow.setBatchSize}
        onReview={() => flow.setPhase('review')}
        onProcessAll={() => {
          flow.setAllReviewState('include');
          setTimeout(() => flow.startProcessing(true), 0);
        }}
        onAddAllNoAI={() => {
          flow.setAllReviewState('include');
          setTimeout(() => flow.startProcessing(false), 0);
        }}
      />
    );
  }

  if (flow.phase === 'review') {
    return (
      <UploadReview
        reviewBatch={flow.reviewBatch}
        stateMap={flow.stateMap}
        includedCount={flow.includedCount}
        onCycleState={flow.cycleState}
        onSetAllState={flow.setAllReviewState}
        onProcess={flow.startProcessing}
        onBack={() => flow.setPhase('pick-batch')}
      />
    );
  }

  if (flow.phase === 'processing') {
    return (
      <UploadProcessing
        totalToProcess={flow.totalToProcess}
        doneCount={flow.doneCount}
        failCount={flow.failCount}
        paused={flow.paused}
        analyzeWithAI={flow.analyzeWithAI}
        onTogglePause={flow.togglePause}
        onStop={flow.stopProcessing}
      />
    );
  }

  // done
  return (
    <UploadDone
      doneCount={flow.doneCount}
      failCount={flow.failCount}
      hasFailures={flow.hasFailures}
      failedCount={flow.failedAssetsRef.current.length}
      hasMoreBatches={flow.newAssets.length > flow.batchSize}
      onRetryFailed={flow.onRetryFailed}
      onNextBatch={() => flow.setPhase('review')}
    />
  );
}
