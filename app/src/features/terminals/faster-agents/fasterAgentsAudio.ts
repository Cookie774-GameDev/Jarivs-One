/** Exact bundled files from OpenWhip commit 83b976d (MIT). */
export const OPENWHIP_CRACK_URLS = ['A', 'B', 'C', 'D', 'E'].map(
  (name) => `/audio/openwhip/${name}.mp3`,
);

export const OPENWHIP_AUDIO_VOICES_PER_SOUND = 3;

const players = new Map<string, HTMLAudioElement[]>();
const playerCursor = new Map<string, number>();
let preloaded = false;

function playersFor(url: string): HTMLAudioElement[] {
  const existing = players.get(url);
  if (existing) return existing;
  const voices = Array.from({ length: OPENWHIP_AUDIO_VOICES_PER_SOUND }, () => {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = 0.72;
    return audio;
  });
  players.set(url, voices);
  playerCursor.set(url, 0);
  return voices;
}

export function preloadOpenWhipCracks(): void {
  if (typeof Audio === 'undefined' || preloaded) return;
  for (const url of OPENWHIP_CRACK_URLS) {
    for (const player of playersFor(url)) player.load();
  }
  preloaded = true;
}

export async function playOpenWhipCrack(random = Math.random): Promise<boolean> {
  if (typeof Audio === 'undefined') return false;
  const index = Math.min(
    OPENWHIP_CRACK_URLS.length - 1,
    Math.floor(Math.max(0, random()) * OPENWHIP_CRACK_URLS.length),
  );
  const url = OPENWHIP_CRACK_URLS[index]!;
  const voices = playersFor(url);
  const cursor = playerCursor.get(url) ?? 0;
  const audio = voices[cursor % voices.length]!;
  playerCursor.set(url, (cursor + 1) % voices.length);
  try {
    audio.currentTime = 0;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

export function resetFasterAgentsAudioForTests(): void {
  for (const voices of players.values()) {
    for (const audio of voices) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  }
  players.clear();
  playerCursor.clear();
  preloaded = false;
}
