import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Display, Kicker, ProgressRail, SceneShell, reveal, scaleIn} from '../components';
import {COLORS, FONT} from '../theme';

const featureCards = [
  {eyebrow: 'BUILD', title: 'Live terminals', body: 'Spawn, read, write, run, and verify without leaving the workspace.', icon: '>_', color: COLORS.cyan},
  {eyebrow: 'TALK', title: 'Voice + vision', body: 'Speak naturally, share what you see, and keep the context alive.', icon: '◉', color: COLORS.copper},
  {eyebrow: 'THINK', title: 'Context map', body: 'Files, chats, agents, terminals, and decisions connected in one graph.', icon: '◇', color: COLORS.sage},
  {eyebrow: 'TRUST', title: 'Private by design', body: 'Local-first workflows, clear approvals, and no vendor lock-in.', icon: '⌾', color: COLORS.plum},
  {eyebrow: 'EXTEND', title: 'Skills ecosystem', body: 'Bring your own models, tools, plugins, providers, and workflows.', icon: '✦', color: '#f29b68'},
  {eyebrow: 'OWN', title: 'Open source', body: 'Inspect it. Fork it. Self-host it. Build the workspace you actually want.', icon: '⌘', color: '#f1c66c'},
];

const FeatureCard = ({feature, index, frame}) => {
  const entry = scaleIn(frame, 10 + index * 5, {stiffness: 145, damping: 20});
  const active = Math.floor(frame / 25) % featureCards.length === index;
  const lift = active ? -12 : 0;
  return (
    <div style={{position: 'relative', height: 282, borderRadius: 26, padding: '27px 28px', background: active ? `linear-gradient(145deg, ${feature.color}19, rgba(24,20,16,.92))` : 'linear-gradient(145deg, rgba(34,29,23,.88), rgba(19,16,13,.82))', border: `1px solid ${active ? feature.color + '72' : 'rgba(255,255,255,.09)'}`, boxShadow: active ? `0 28px 70px ${feature.color}18, 0 0 42px ${feature.color}14 inset` : '0 22px 60px rgba(0,0,0,.28)', transform: `translateY(${lift}px) scale(${.9 + entry * .1})`, opacity: entry, overflow: 'hidden'}}>
      <div style={{position: 'absolute', right: -50, top: -55, width: 190, height: 190, borderRadius: '50%', background: `radial-gradient(circle, ${feature.color}32, transparent 70%)`, filter: 'blur(12px)'}} />
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{fontSize: 12, fontWeight: 850, color: feature.color, letterSpacing: '.15em'}}>{feature.eyebrow}</div>
        <div style={{fontFamily: FONT.mono, width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 15, background: `${feature.color}18`, border: `1px solid ${feature.color}38`, color: feature.color, fontSize: 20, fontWeight: 800}}>{feature.icon}</div>
      </div>
      <div style={{fontFamily: FONT.display, fontSize: 36, fontWeight: 650, letterSpacing: '-.035em', marginTop: 25}}>{feature.title}</div>
      <div style={{fontSize: 18, color: COLORS.muted, lineHeight: 1.48, marginTop: 13, maxWidth: 390}}>{feature.body}</div>
      <div style={{position: 'absolute', left: 28, right: 28, bottom: 22, height: 2, borderRadius: 4, background: `linear-gradient(90deg, ${feature.color}, transparent)`, opacity: active ? .8 : .22, transform: `scaleX(${active ? 1 : .35})`, transformOrigin: 'left'}} />
    </div>
  );
};

export const FeatureScene = ({duration}) => {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame, [0, duration], [-300, 1900], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <SceneShell duration={duration}>
      <div style={{position: 'absolute', left: 84, top: 78, right: 84, textAlign: 'center'}}>
        <Kicker color={COLORS.copper} style={reveal(frame, 4, 22, 22)}>ONE SPACE. THE WHOLE BUILD.</Kicker>
        <Display size={76} style={{marginTop: 19, ...reveal(frame, 11, 38, 27)}}>
          Everything your project needs—<span style={{color: COLORS.sage}}>working together.</span>
        </Display>
      </div>

      <div style={{position: 'absolute', left: 84, right: 84, top: 285, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18}}>
        {featureCards.map((feature, i) => <FeatureCard key={feature.title} feature={feature} index={i} frame={frame} />)}
      </div>

      <div style={{position: 'absolute', left: sweep, top: 245, width: 280, height: 650, transform: 'skewX(-18deg)', background: 'linear-gradient(90deg, transparent, rgba(245,239,230,.055), transparent)', filter: 'blur(12px)', pointerEvents: 'none'}} />
      <div style={{position: 'absolute', right: 84, bottom: 52, fontSize: 15, color: COLORS.faint, letterSpacing: '.08em', fontWeight: 750, ...reveal(frame, 62, 14, 22)}}>WEB · WINDOWS · macOS · LINUX · iOS · ANDROID</div>
      <ProgressRail active={5} />
    </SceneShell>
  );
};
