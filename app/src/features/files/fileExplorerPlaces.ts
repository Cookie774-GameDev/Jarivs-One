/**
 * Resolve OS "Places" (Home, Desktop, Documents, Pictures, …) for the
 * themed file explorer sidebar.
 */
import { isTauri } from '@/lib/utils';
import { joinPath } from './projectFiles';

export interface ExplorerPlace {
  id: string;
  label: string;
  path: string;
  /** Lucide-ish key for icon mapping in the UI */
  icon: 'home' | 'desktop' | 'documents' | 'pictures' | 'videos' | 'downloads' | 'music' | 'drive';
}

function stripSlash(path: string): string {
  return path.replace(/[\\/]+$/, '') || path;
}

async function tryPathApi(
  fn: () => Promise<string>,
): Promise<string | null> {
  try {
    const value = await fn();
    return value ? stripSlash(value) : null;
  } catch {
    return null;
  }
}

/** Build the quick-access places list for the current OS. */
export async function resolveExplorerPlaces(): Promise<ExplorerPlace[]> {
  const places: ExplorerPlace[] = [];
  let home: string | null = null;

  if (isTauri) {
    try {
      const pathApi = await import('@tauri-apps/api/path');
      home = await tryPathApi(() => pathApi.homeDir());
      const desktop = await tryPathApi(() => pathApi.desktopDir());
      const documents = await tryPathApi(() => pathApi.documentDir());
      const downloads = await tryPathApi(() => pathApi.downloadDir());
      const pictures = await tryPathApi(() => pathApi.pictureDir());
      const videos = await tryPathApi(() => pathApi.videoDir());
      const musicFn = (pathApi as unknown as { musicDir?: () => Promise<string> }).musicDir;
      const music =
        typeof musicFn === 'function'
          ? await tryPathApi(() => musicFn())
          : home
            ? joinPath(home, 'Music')
            : null;

      if (home) places.push({ id: 'home', label: 'Home', path: home, icon: 'home' });
      if (desktop) places.push({ id: 'desktop', label: 'Desktop', path: desktop, icon: 'desktop' });
      if (documents) places.push({ id: 'documents', label: 'Documents', path: documents, icon: 'documents' });
      if (downloads) places.push({ id: 'downloads', label: 'Downloads', path: downloads, icon: 'downloads' });
      if (pictures) places.push({ id: 'pictures', label: 'Pictures', path: pictures, icon: 'pictures' });
      if (videos) places.push({ id: 'videos', label: 'Videos', path: videos, icon: 'videos' });
      if (music) places.push({ id: 'music', label: 'Music', path: music, icon: 'music' });
    } catch {
      /* fall through to defaults */
    }
  }

  if (places.length === 0) {
    // Browser / bridge-down defaults — path field still works.
    const isWin = typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent);
    if (isWin) {
      places.push(
        { id: 'users', label: 'Users', path: 'C:\\Users', icon: 'home' },
        { id: 'c', label: 'C: drive', path: 'C:\\', icon: 'drive' },
      );
    } else {
      places.push(
        { id: 'home', label: 'Home', path: '/home', icon: 'home' },
        { id: 'root', label: 'Root', path: '/', icon: 'drive' },
      );
    }
  } else if (home && /\\Users\\|\/Users\//i.test(home.replace(/\//g, '\\')) === false) {
    // Non-Windows already fine
  }

  // Windows: expose C:\ as Computer-ish shortcut when home is under C:
  if (home && /^[A-Za-z]:/.test(home)) {
    const drive = `${home[0]}:\\`;
    if (!places.some((p) => p.path.replace(/[\\/]+$/, '').toLowerCase() === drive.replace(/[\\/]+$/, '').toLowerCase())) {
      places.push({ id: 'drive', label: `${home[0]}: Drive`, path: drive, icon: 'drive' });
    }
  }

  return places;
}
