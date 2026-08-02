/**
 * Mounts the first-run product tutorial offer + interactive tour.
 * Only when `productTutorialStatus === 'pending'` (set by finishOnboarding).
 */
import * as React from 'react';
import { useUIStore } from '@/stores/ui';
import { completeTutorial, shouldOfferTutorial, skipTutorial } from './tutorialState';
import { ProductTutorialOffer } from './ProductTutorialOffer';
import { ProductTutorialTour } from './ProductTutorialTour';
import './product-tutorial.sakura.css';

type Phase = 'hidden' | 'offer' | 'tour';

export function ProductTutorialHost({
  runtimeEffectsEnabled = true,
}: {
  runtimeEffectsEnabled?: boolean;
} = {}) {
  const status = useUIStore((s) => s.productTutorialStatus);
  const setStatus = useUIStore((s) => s.setProductTutorialStatus);
  const onboardingComplete = useUIStore((s) => s.onboardingComplete);

  const [phase, setPhase] = React.useState<Phase>(runtimeEffectsEnabled ? 'hidden' : 'offer');
  const offeredRef = React.useRef(false);

  React.useEffect(() => {
    if (!runtimeEffectsEnabled) return;
    if (!onboardingComplete) return;
    if (!shouldOfferTutorial(status)) {
      setPhase('hidden');
      return;
    }
    if (offeredRef.current) return;
    offeredRef.current = true;
    // Let the shell paint first so tour targets exist when the user starts.
    const t = window.setTimeout(() => setPhase('offer'), 700);
    return () => window.clearTimeout(t);
  }, [onboardingComplete, runtimeEffectsEnabled, status]);

  const handleSkip = React.useCallback(() => {
    if (runtimeEffectsEnabled) setStatus(skipTutorial());
    setPhase('hidden');
  }, [runtimeEffectsEnabled, setStatus]);

  const handleStart = React.useCallback(() => {
    setPhase('tour');
  }, []);

  const handleDone = React.useCallback(() => {
    if (runtimeEffectsEnabled) setStatus(completeTutorial());
    setPhase('hidden');
  }, [runtimeEffectsEnabled, setStatus]);

  if (phase === 'hidden') return null;
  if (phase === 'offer') {
    return (
      <div
        data-monochrome-surface="product-tutorial-host"
        data-vibespace-owned-chrome="product-tutorial"
        className={`${runtimeEffectsEnabled ? 'contents' : 'pointer-events-none fixed inset-0'} [html[data-theme=monochrome]_&_*]:![background-image:none] [html[data-theme=monochrome]_&_*]:![filter:none] [html[data-theme=monochrome]_&_*]:![backdrop-filter:none] [html[data-theme=monochrome]_&_*]:!shadow-none [html[data-theme=monochrome]_&_*]:!animate-none`}
      >
        <ProductTutorialOffer onStart={handleStart} onSkip={handleSkip} />
      </div>
    );
  }
  return (
    <div
      data-monochrome-surface="product-tutorial-host"
      data-vibespace-owned-chrome="product-tutorial"
      className={`${runtimeEffectsEnabled ? 'contents' : 'pointer-events-none fixed inset-0'} [html[data-theme=monochrome]_&_*]:![background-image:none] [html[data-theme=monochrome]_&_*]:![filter:none] [html[data-theme=monochrome]_&_*]:![backdrop-filter:none] [html[data-theme=monochrome]_&_*]:!shadow-none [html[data-theme=monochrome]_&_*]:!animate-none`}
    >
      <ProductTutorialTour onDone={handleDone} onSkip={handleSkip} />
    </div>
  );
}
