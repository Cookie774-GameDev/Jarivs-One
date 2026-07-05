/** Mirrors AmbientAudioHost playback gate — keep in sync. */
export function shouldAmbientMusicPlay(
  ambient: boolean,
  ambientActive: boolean,
  ambientDrone: boolean,
  ambientAlwaysPlay: boolean,
): boolean {
  if (ambientAlwaysPlay) return true;
  return ambient && ambientActive && ambientDrone;
}
