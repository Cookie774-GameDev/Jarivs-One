/**
 * Mounts the first-run product tutorial offer + interactive tour.
 * Only when `productTutorialStatus === 'pending'` (set by finishOnboarding).
 */
import * as React from 'react';
import { useUIStore } from '@/stores/ui';
import {
  completeTutorial,
  shouldOfferTutorial,
  skipTutorial,
} from './tutorialState';
import { ProductTutorialOffer } from './ProductTutorialOffer';
import { ProductTutorialTour } from './ProductTutorialTour';

type Phase = 'hidden' | 'offer' | 'tour';

export function ProductTutorialHost() {
  const status = useUIStore((s) => s.productTutorialStatus);
  const setStatus = useUIStore((s) => s.setProductTutorialStatus);
  const onboardingComplete = useUIStore((s) => s.onboardingComplete);

  const [phase, setPhase] = React.useState<Phase>('hidden');
  const offeredRef = React.useRef(false);

  React.useEffect(() => {
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
  }, [onboardingComplete, status]);

  const handleSkip = React.useCallback(() => {
    setStatus(skipTutorial());
    setPhase('hidden');
  }, [setStatus]);

  const handleStart = React.useCallback(() => {
    setPhase('tour');
  }, []);

  const handleDone = React.useCallback(() => {
    setStatus(completeTutorial());
    setPhase('hidden');
  }, [setStatus]);

  if (phase === 'hidden') return null;
  if (phase === 'offer') {
    return <ProductTutorialOffer onStart={handleStart} onSkip={handleSkip} />;
  }
  return <ProductTutorialTour onDone={handleDone} onSkip={handleSkip} />;
}
