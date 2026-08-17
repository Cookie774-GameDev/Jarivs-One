import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Display, Kicker, LogoMark, ProgressRail, SceneShell, reveal, scaleIn} from '../components';
import {COLORS, FONT} from '../theme';

const agents = [
  {name: 'Sage', role: 'Research', color: COLORS.sage, angle: -155},
  {name: 'Scout', role: 'Discovery', color: COLORS.cyan, angle: -100},
  {name: 'Atlas', role: 'Planning', color: COLORS.copper, angle: -42},
  {name: 'Forge', role: 'Coding', color: COLORS.plum, angle: 14},
  {name: 'Cipher', role: 'Security', color: '#ff8f70', angle: 69},
  {name: 'Pulse', role: 'Testing', color: '#f4c46d', angle: 125},
];

const AgentNode = ({agent, frame, index}) => {
  const radiusX = 392;
  const radiusY = 287;
  const angle = (agent.angle + Math.sin(frame * .012 + index) * 4) * (Math.PI / 180);
  const x = 505 + Math.cos(angle) * radiusX;
  const y = 432 + Math.sin(angle) * radiusY;
  const entry = scaleIn(frame, 16 + index * 5, {stiffness: 135});
  const active = Math.floor(frame / 30) % agents.length === index;
  return (
    <div style={{position: 'absolute', left: x - 78, top: y - 50, width: 156, transform: `scale(${entry})`, opacity: entry}}>
      <div style={{height: 100, borderRadius: 22, padding: '14px 15px', background: active ? `${agent.color}20` : 'rgba(28,23,19,.92)', border: `1px solid ${active ? agent.color : 'rgba(255,255,255,.10)'}`, boxShadow: active ? `0 0 44px ${agent.color}35` : '0 16px 42px rgba(0,0,0,.32)', display: 'flex', alignItems: 'center', gap: 12}}>
        <div style={{width: 43, height: 43, borderRadius: 14, background: `linear-gradient(135deg, ${agent.color}, #15110f)`, display: 'grid', placeItems: 'center', fontFamily: FONT.display, fontSize: 21, fontWeight: 800, boxShadow: `0 0 20px ${agent.color}33`}}>{agent.name[0]}</div>
        <div>
          <div style={{fontSize: 17, fontWeight: 820}}>{agent.name}</div>
          <div style={{fontSize: 12, color: agent.color, marginTop: 4, fontWeight: 720}}>{agent.role}</div>
        </div>
      </div>
    </div>
  );
};

export const AgentsScene = ({duration}) => {
  const frame = useCurrentFrame();
  const mapScale = scaleIn(frame, 10, {damping: 22});
  const packet = (frame * 2.2) % 100;

  return (
    <SceneShell duration={duration}>
      <div style={{position: 'absolute', right: 88, top: 138, width: 640}}>
        <Kicker color={COLORS.plum} style={reveal(frame, 7, 24, 22)}>AGENT COUNCIL</Kicker>
        <Display size={86} style={{marginTop: 22, ...reveal(frame, 14, 48, 28)}}>
          Ten agents. <span style={{color: COLORS.sage}}>One shared context.</span>
        </Display>
        <div style={{fontSize: 27, color: COLORS.muted, lineHeight: 1.5, marginTop: 28, maxWidth: 580, ...reveal(frame, 26, 28, 25)}}>
          Research, plan, code, test, and secure in parallel—then hand off work without losing the thread.
        </div>
        <div style={{marginTop: 34, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...reveal(frame, 38, 22, 24)}}>
          {[
            ['28', 'FILES LINKED', COLORS.sage],
            ['10', 'ACTIVE AGENTS', COLORS.plum],
            ['03', 'LIVE TERMINALS', COLORS.cyan],
            ['01', 'SOURCE OF TRUTH', COLORS.copper],
          ].map(([value, label, color]) => (
            <div key={label} style={{padding: '19px 20px', borderRadius: 18, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.035)'}}>
              <div style={{fontFamily: FONT.display, fontSize: 35, color, fontWeight: 700}}>{value}</div>
              <div style={{fontSize: 12, color: COLORS.faint, marginTop: 6, fontWeight: 850, letterSpacing: '.12em'}}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{position: 'absolute', left: 48, top: 72, width: 1060, height: 880, transform: `scale(${.92 + mapScale * .08})`, ...reveal(frame, 8, 28, 28)}}>
        <svg width="1060" height="880" style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <defs>
            <radialGradient id="map-glow">
              <stop offset="0%" stopColor={COLORS.copper} stopOpacity=".28" />
              <stop offset="100%" stopColor={COLORS.copper} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="505" cy="432" r="360" fill="none" stroke="rgba(245,239,230,.055)" strokeWidth="1" strokeDasharray="6 14" />
          <circle cx="505" cy="432" r="235" fill="none" stroke="rgba(245,239,230,.04)" strokeWidth="1" />
          {agents.map((agent, i) => {
            const a = agent.angle * Math.PI / 180;
            const x = 505 + Math.cos(a) * 392;
            const y = 432 + Math.sin(a) * 287;
            return (
              <g key={agent.name}>
                <line x1="505" y1="432" x2={x} y2={y} stroke={agent.color} strokeOpacity=".24" strokeWidth="2" />
                <circle cx={505 + (x - 505) * (packet / 100)} cy={432 + (y - 432) * (packet / 100)} r="5" fill={agent.color} opacity={.55 + Math.sin(frame * .12 + i) * .25} />
              </g>
            );
          })}
          <circle cx="505" cy="432" r="240" fill="url(#map-glow)" />
        </svg>

        <div style={{position: 'absolute', left: 505 - 126, top: 432 - 126, width: 252, height: 252, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle, rgba(34,29,23,.98), rgba(16,13,10,.95))', border: `1px solid ${COLORS.copper}66`, boxShadow: `0 0 70px ${COLORS.copper}28, inset 0 0 45px rgba(255,255,255,.04)`}}>
          <LogoMark size={112} />
          <div style={{position: 'absolute', bottom: 44, fontSize: 13, fontWeight: 850, letterSpacing: '.13em', color: COLORS.copper}}>SHARED CONTEXT</div>
        </div>

        {agents.map((agent, i) => <AgentNode key={agent.name} agent={agent} frame={frame} index={i} />)}

        <div style={{position: 'absolute', left: 252, top: 736, width: 510, borderRadius: 18, padding: '16px 20px', background: 'rgba(20,17,13,.92)', border: '1px solid rgba(255,255,255,.09)', boxShadow: '0 18px 50px rgba(0,0,0,.35)', ...reveal(frame, 64, 18, 25)}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: COLORS.plum, fontWeight: 800}}><span style={{width: 9, height: 9, borderRadius: 50, background: COLORS.plum, boxShadow: `0 0 14px ${COLORS.plum}`}} /> FORGE → PULSE</div>
          <div style={{marginTop: 7, fontSize: 17, color: COLORS.muted}}>Patch ready. Run the focused regression suite, then report back to Jarvis.</div>
        </div>
      </div>
      <ProgressRail active={3} />
    </SceneShell>
  );
};
