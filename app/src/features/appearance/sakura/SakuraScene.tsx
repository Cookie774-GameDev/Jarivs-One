import * as React from 'react';
import sceneUrl from './sakura-scene.svg';

export function SakuraScene() {
  return (
    <img
      alt=""
      aria-hidden="true"
      className="h-full w-full select-none object-cover"
      data-sakura-scene=""
      draggable={false}
      src={sceneUrl}
    />
  );
}
