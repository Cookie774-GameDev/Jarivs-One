import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Display, GradientText, LogoMark, Pill, ProgressRail, SceneShell, reveal, scaleIn} from '../components';
import {COLORS, FONT} from '../theme';

export const FinaleScene = ({duration}) => {
  const frame = useCurrentFrame();
  const logo = scaleIn(frame, 5, {damping: 16, stiffness: 125});
  const halo = 1 + Math.sin(frame * .07) * .035;
  const line = interpolate(frame, [33, 68], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <SceneShell duration={duration} outro={false}>
      <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
        <div style={{position: 'absolute', width: 720, height: 720, borderRadius: '50%', background: `radial-gradient(circle, ${COLORS.copper}18 0%, ${COLORS.plum}0e 37%, transparent 69%)`, transform: `scale(${halo})`, filter: 'blur(6px)'}} />
        <div style={{position: 'relative', transform: `scale(${.76 + logo * .24})`, opacity: logo}}>
          <div style={{position: 'absolute', inset: -60, borderRadius: '50%', border: `1px solid ${COLORS.copper}42`, boxShadow: `0 0 80px ${COLORS.copper}1f`, transform: `scale(${1 + Math.sin(frame * .09) * .04})`}} />
          <LogoMark size={150} />
        </div>

        <div style={{marginTop: 32, ...reveal(frame, 13, 34, 28)}}>
          <Display size={120}>VibeSpace</Display>
        </div>
        <div style={{marginTop: 17, fontFamily: FONT.display, fontSize: 55, letterSpacing: '-.04em', ...reveal(frame, 22, 28, 26)}}>
          <GradientText>Create together. Play together.</GradientText>
        </div>
        <div style={{width: 760, height: 2, marginTop: 35, background: `linear-gradient(90deg, transparent, ${COLORS.copper}, ${COLORS.sage}, ${COLORS.cyan}, transparent)`, transform: `scaleX(${line})`, opacity: .75}} />

        <div style={{display: 'flex', gap: 13, marginTop: 32, ...reveal(frame, 42, 20, 24)}}>
          <Pill color={COLORS.copper}>OPEN SOURCE</Pill>
          <Pill color={COLORS.sage}>PRIVATE BY DESIGN</Pill>
          <Pill color={COLORS.cyan}>BUILT BY A VIBE CODER</Pill>
        </div>

        <div style={{marginTop: 35, fontFamily: FONT.mono, fontSize: 19, color: COLORS.muted, letterSpacing: '.035em', ...reveal(frame, 55, 18, 24)}}>
          github.com/Cookie774-GameDev/VibeSpace
        </div>
        <div style={{position: 'absolute', bottom: 46, fontSize: 13, color: COLORS.faint, fontWeight: 800, letterSpacing: '.18em', ...reveal(frame, 65, 14, 20)}}>
          ALMOST UNVEILED
        </div>
      </div>
      <ProgressRail active={6} />
    </SceneShell>
  );
};
