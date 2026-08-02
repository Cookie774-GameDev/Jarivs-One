import * as React from 'react';

const PETALS = [
  { delay: '-4s', duration: '18s', left: '7%', size: '10px', sway: '72px' },
  { delay: '-13s', duration: '24s', left: '19%', size: '7px', sway: '-54px' },
  { delay: '-7s', duration: '21s', left: '34%', size: '9px', sway: '46px' },
  { delay: '-16s', duration: '27s', left: '48%', size: '6px', sway: '-82px' },
  { delay: '-10s', duration: '22s', left: '61%', size: '11px', sway: '64px' },
  { delay: '-2s', duration: '19s', left: '73%', size: '8px', sway: '-45px' },
  { delay: '-20s', duration: '26s', left: '84%', size: '7px', sway: '58px' },
  { delay: '-8s', duration: '23s', left: '94%', size: '10px', sway: '-68px' },
] as const;

export const SAKURA_PETAL_COUNT = PETALS.length;

export interface SakuraPetalsProps {
  paused: boolean;
  staticMode?: boolean;
}

type PetalStyle = React.CSSProperties & {
  '--sakura-petal-delay': string;
  '--sakura-petal-duration': string;
  '--sakura-petal-left': string;
  '--sakura-petal-size': string;
  '--sakura-petal-sway': string;
};

export function SakuraPetals({ paused, staticMode = false }: SakuraPetalsProps) {
  if (staticMode) return null;

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden"
      data-sakura-paused={paused ? 'true' : 'false'}
      data-sakura-petals=""
    >
      {PETALS.map((petal, index) => (
        <span
          className="absolute block"
          data-sakura-petal={String(index + 1)}
          key={index}
          style={
            {
              '--sakura-petal-delay': petal.delay,
              '--sakura-petal-duration': petal.duration,
              '--sakura-petal-left': petal.left,
              '--sakura-petal-size': petal.size,
              '--sakura-petal-sway': petal.sway,
            } as PetalStyle
          }
        />
      ))}
    </div>
  );
}
