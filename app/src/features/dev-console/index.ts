/**
 * Dev console feature barrel.
 *
 * Exposes:
 *   - <DevConsolePanel/> — the bottom-attached UI surface.
 *   - <DevConsoleHost/>  — wires patchers + hotkey + boot breadcrumbs.
 *                           Mount once at the App root.
 *   - devConsole         — imperative facade for non-React callers.
 *   - useDevConsoleStore — direct store access for advanced UI.
 */

export { DevConsolePanel } from './DevConsolePanel';
export { DevConsoleHost } from './DevConsoleHost';
export {
  devConsole,
  useDevConsoleStore,
  filterEntries,
  safeStringify,
  type DevLogChannel,
  type DevLogLevel,
  type DevLogEntry,
  type DevLogViewMode,
} from './store';
export {
  buildEvidenceLanes,
  calculateVirtualWindow,
  exportDevLog,
  formatDevLogTimestamp,
  humanizeEntry,
  type DevLogArtifact,
  type DevLogEvidenceLane,
  type DevLogLaneKind,
  type DevLogVirtualWindow,
} from './fullDevLog';
export { installPatchers } from './patchers';
