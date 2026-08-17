import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Brand, Display, GradientText, Pill, ProgressRail, SceneShell, reveal, scaleIn} from '../components';
import {COLORS, FONT} from '../theme';

const Word = ({children, delay}) => {
  const frame = useCurrentFrame();
  const style = reveal(frame, delay, 72, 30);
  return <span style={{display: 'inline-block', marginRight: 24, ...style}}>{children}</span>;
};

export const HeroScene = ({duration}) => {
  const frame = useCurrentFrame();
  const line = interpolate(frame, [30, 78], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const badgeScale = scaleIn(frame, 9);

  return (
    <SceneShell duration={duration} intro={false}>
      <div style={{position: 'absolute', left: 76, top: 56, ...reveal(frame, 3, 22, 24)}}>
        <Brand compact />
      </div>

      <div style={{position: 'absolute', left: 140, right: 120, top: 220}}>
        <div style={{transform: `scale(${0.88 + badgeScale * 0.12})`, transformOrigin: 'left center', ...reveal(frame, 7, 20, 22)}}>
          <Pill color={COLORS.sage}>
            <span style={{width: 9, height: 9, borderRadius: 20, background: COLORS.sage, boxShadow: `0 0 14px ${COLORS.sage}`}} />
            The AI-native workspace
          </Pill>
        </div>

        <Display size={128} style={{marginTop: 42, maxWidth: 1640}}>
          <div><Word delay={15}>Create.</Word></div>
          <div><Word delay={23}><GradientText>Create together.</GradientText></Word></div>
          <div><Word delay={31}><GradientText>Play together.</GradientText></Word></div>
        </Display>

        <div style={{marginTop: 38, maxWidth: 1030, fontSize: 31, lineHeight: 1.42, color: COLORS.muted, fontWeight: 460, ...reveal(frame, 43, 32, 30)}}>
          Ten AI agents, live terminals, voice, calls, context, and creation—working around one copper-lit table.
        </div>

        <div style={{display: 'flex', gap: 14, marginTop: 34, ...reveal(frame, 54, 24, 26)}}>
          {['OPEN SOURCE', 'PRIVATE BY DESIGN', 'NO VENDOR LOCK-IN'].map((label, i) => (
            <div
              key={label}
              style={{
                padding: '12px 18px',
                borderRadius: 999,
                border: '1px solid rgba(245,239,230,.12)',
                background: 'rgba(245,239,230,.045)',
                color: i === 0 ? COLORS.copper : i === 1 ? COLORS.sage : COLORS.cyan,
                fontSize: 15,
                fontWeight: 800,
                letterSpacing: '.09em',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 82,
          bottom: 70,
          width: 390,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${COLORS.copper})`,
          transform: `scaleX(${line})`,
          transformOrigin: 'right center',
          opacity: .7,
        }}
      />
      <div style={{position: 'absolute', right: 82, bottom: 84, fontFamily: FONT.mono, color: COLORS.faint, fontSize: 15, letterSpacing: '.08em', ...reveal(frame, 66, 16, 24)}}>
        VIBESPACE // BUILD WHAT MOVES YOU
      </div>
      <ProgressRail active={0} />
    </SceneShell>
  );
};
