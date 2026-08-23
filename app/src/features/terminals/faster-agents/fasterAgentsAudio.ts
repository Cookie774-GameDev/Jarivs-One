/** Exact bundled files from OpenWhip commit 83b976d (MIT). */
export const OPENWHIP_CRACK_URLS = ['A', 'B', 'C', 'D', 'E'].map(
  (name) => `/audio/openwhip/${name}.mp3`,
);

const players = new Map<string, HTMLAudioElement>();

function playerFor(url: string): HTMLAudioElement {
  const existing = players.get(url);
  if (existing) return existing;
  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.volume = 0.72;
  players.set(url, audio);
  return audio;
}

export function preloadOpenWhipCracks(): void {
  if (typeof Audio === 'undefined') return;
  for (const url of OPENWHIP_CRACK_URLS) playerFor(url).load();
}

export async function playOpenWhipCrack(random = Math.random): Promise<boolean> {
  if (typeof Audio === 'undefined') return false;
  const index = Math.min(
    OPENWHIP_CRACK_URLS.length - 1,
    Math.floor(Math.max(0, random()) * OPENWHIP_CRACK_URLS.length),
  );
  const audio = playerFor(OPENWHIP_CRACK_URLS[index]!);
  try {
    audio.currentTime = 0;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

export function resetFasterAgentsAudioForTests(): void {
  for (const audio of players.values()) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  players.clear();
}
