/**
 * The one selected-engine dictation boundary for non-composer destinations.
 * It intentionally owns capture/lifecycle only; each caller owns text
 * placement (field selection, terminal session, or explicit global paste).
 */
export {
  createSelectedSttSession,
  type DictationEngineId,
  type GlobalDictationSession as SelectedSttSession,
} from '@/features/global-dictation/dictationSession';
