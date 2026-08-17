import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Display, Kicker, Pill, ProgressRail, SceneShell, WindowChrome, reveal, scaleIn} from '../components';
import {COLORS, FONT} from '../theme';

const Waveform = ({frame}) => (
  <div style={{height: 146, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9}}>
    {Array.from({length: 33}).map((_, i) => {
      const center = 1 - Math.abs(i - 16) / 18;
      const signal = Math.sin(frame * .22 + i * .68) * .55 + Math.sin(frame * .08 + i * .31) * .45;
      const height = 18 + Math.max(0, center) * (40 + Math.abs(signal) * 74);
      const color = i < 11 ? COLORS.copper : i < 22 ? COLORS.plum : COLORS.cyan;
      return <div key={i} style={{width: 7, height, borderRadius: 99, background: color, opacity: .42 + center * .45, boxShadow: center > .72 ? `0 0 16px ${color}66` : undefined}} />;
    })}
  </div>
);

const Orb = ({frame}) => {
  const pulse = 1 + Math.sin(frame * .11) * .028;
  const ring = interpolate(frame % 90, [0, 90], [.8, 1.55]);
  const ringOpacity = interpolate(frame % 90, [0, 90], [.65, 0]);
  return (
    <div style={{position: 'relative', width: 420, height: 420, display: 'grid', placeItems: 'center'}}>
      <div style={{position: 'absolute', width: 330, height: 330, borderRadius: '50%', border: `2px solid ${COLORS.cyan}`, opacity: ringOpacity, transform: `scale(${ring})`, boxShadow: `0 0 60px ${COLORS.cyan}33`}} />
      <div style={{position: 'absolute', width: 310, height: 310, borderRadius: '50%', border: `1px solid ${COLORS.copper}77`, transform: `scale(${1 + Math.sin(frame * .07) * .045})`, boxShadow: `0 0 70px ${COLORS.copper}30`}} />
      <div style={{width: 250, height: 250, borderRadius: '50%', transform: `scale(${pulse})`, background: `radial-gradient(circle at 36% 30%, #f5efe6 0%, ${COLORS.cyan} 8%, ${COLORS.plum} 33%, ${COLORS.copperDeep} 65%, #17100c 100%)`, boxShadow: `0 0 40px ${COLORS.cyan}66, 0 0 120px ${COLORS.plum}55, inset -28px -30px 52px rgba(0,0,0,.42)`, overflow: 'hidden'}}>
        <div style={{width: '130%', height: '36%', marginLeft: '-15%', marginTop: '32%', transform: `rotate(${frame * .5}deg)`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.48), transparent)', filter: 'blur(12px)', opacity: .55}} />
      </div>
    </div>
  );
};

export const VoiceScene = ({duration}) => {
  const frame = useCurrentFrame();
  const uiScale = scaleIn(frame, 12);
  const transcript = 'I found the failed build, traced the terminal error, and prepared a safe fix. Want me to run it?';
  const chars = Math.floor(interpolate(frame, [45, 120], [0, transcript.length], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));

  return (
    <SceneShell duration={duration}>
      <div style={{position: 'absolute', left: 90, top: 125, width: 660}}>
        <Kicker color={COLORS.cyan} style={reveal(frame, 6, 24, 22)}>JARVIS VOICE</Kicker>
        <Display size={90} style={{marginTop: 22, ...reveal(frame, 13, 48, 28)}}>
          Talk to your workspace.
        </Display>
        <div style={{fontSize: 28, color: COLORS.muted, lineHeight: 1.5, marginTop: 28, maxWidth: 580, ...reveal(frame, 25, 28, 25)}}>
          Natural voice, live captions, local speech, and full project context—without leaving the build.
        </div>
        <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 34, ...reveal(frame, 37, 20, 24)}}>
          <Pill color={COLORS.copper}>KOKORO LOCAL</Pill>
          <Pill color={COLORS.sage}>HANDS-FREE</Pill>
          <Pill color={COLORS.plum}>LIVE CONTEXT</Pill>
        </div>
      </div>

      <div style={{position: 'absolute', right: 88, top: 86, width: 1010, height: 875, transform: `scale(${.92 + uiScale * .08})`, ...reveal(frame, 10, 30, 28)}}>
        <WindowChrome title="Jarvis Voice Module" style={{height: '100%'}} toolbar={<div style={{fontFamily: FONT.mono, fontSize: 13, color: COLORS.sage}}>MODEL · LOCAL / GEORGE</div>}>
          <div style={{height: 'calc(100% - 62px)', display: 'grid', gridTemplateColumns: '1.05fr .95fr'}}>
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid rgba(255,255,255,.07)', background: 'radial-gradient(circle at 50% 44%, rgba(164,114,240,.09), transparent 62%)'}}>
              <Orb frame={frame} />
              <div style={{fontSize: 25, fontWeight: 780, marginTop: -18}}>Jarvis is speaking</div>
              <div style={{fontSize: 16, color: COLORS.muted, marginTop: 9}}>Connected to UnifiedChungus · 42 ms</div>
              <Waveform frame={frame} />
              <div style={{display: 'flex', gap: 14}}>
                <div style={{width: 64, height: 64, borderRadius: 99, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', fontSize: 25}}>◉</div>
                <div style={{width: 64, height: 64, borderRadius: 99, display: 'grid', placeItems: 'center', background: COLORS.red, boxShadow: `0 0 30px ${COLORS.red}55`, fontSize: 24}}>×</div>
                <div style={{width: 64, height: 64, borderRadius: 99, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', fontSize: 23}}>⌁</div>
              </div>
            </div>

            <div style={{padding: '34px 34px 30px', display: 'flex', flexDirection: 'column'}}>
              <div style={{fontSize: 13, color: COLORS.faint, fontWeight: 850, letterSpacing: '.14em'}}>LIVE TRANSCRIPT</div>
              <div style={{marginTop: 22, padding: '22px 24px', borderRadius: 20, background: `${COLORS.copper}10`, border: `1px solid ${COLORS.copper}2d`}}>
                <div style={{fontSize: 14, color: COLORS.copper, fontWeight: 800}}>YOU · 3:42 PM</div>
                <div style={{fontSize: 23, lineHeight: 1.42, marginTop: 9}}>“What happened to the latest build?”</div>
              </div>
              <div style={{marginTop: 18, padding: '22px 24px', borderRadius: 20, background: `${COLORS.plum}10`, border: `1px solid ${COLORS.plum}2d`, minHeight: 176}}>
                <div style={{fontSize: 14, color: COLORS.plum, fontWeight: 800}}>JARVIS · NOW</div>
                <div style={{fontSize: 22, lineHeight: 1.48, marginTop: 9, color: COLORS.fg}}>{transcript.slice(0, chars)}{chars < transcript.length ? <span style={{color: COLORS.cyan}}>▌</span> : null}</div>
              </div>
              <div style={{marginTop: 24, fontSize: 13, color: COLORS.faint, fontWeight: 850, letterSpacing: '.14em'}}>CONTEXT USED</div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14}}>
                {[
                  ['Terminal #4', 'Build logs', COLORS.cyan],
                  ['PR-31', 'Current branch', COLORS.copper],
                  ['Context Map', '28 linked files', COLORS.sage],
                  ['Forge', 'Suggested patch', COLORS.plum],
                ].map(([title, sub, color]) => (
                  <div key={title} style={{padding: '15px 16px', borderRadius: 14, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)'}}>
                    <div style={{fontSize: 15, color, fontWeight: 780}}>{title}</div>
                    <div style={{fontSize: 13, color: COLORS.faint, marginTop: 5}}>{sub}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12, color: COLORS.sage, fontSize: 14}}>
                <span style={{width: 9, height: 9, borderRadius: 99, background: COLORS.sage, boxShadow: `0 0 15px ${COLORS.sage}`}} />
                Listening securely on-device
              </div>
            </div>
          </div>
        </WindowChrome>
      </div>
      <ProgressRail active={2} />
    </SceneShell>
  );
};
