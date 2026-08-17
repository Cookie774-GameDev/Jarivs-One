import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {
  Display,
  Dot,
  Kicker,
  Pill,
  ProgressRail,
  SceneShell,
  WindowChrome,
  reveal,
  scaleIn,
} from '../components';
import {COLORS, FONT} from '../theme';

const terminalLines = [
  {text: '$ jarvis', color: COLORS.cyan},
  {text: 'Booting Jarvis orchestration layer…', color: COLORS.muted},
  {text: '✓ Context map synchronized', color: COLORS.sage},
  {text: '✓ Local voice engine ready', color: COLORS.sage},
  {text: '✓ Terminal bridge connected', color: COLORS.sage},
  {text: '✓ Vision tools online', color: COLORS.sage},
  {text: '✓ Ten-agent council standing by', color: COLORS.sage},
  {text: '$ hive fast', color: COLORS.cyan},
  {text: 'HIVE STACK  10 agents  •  3 terminals  •  1 shared context', color: COLORS.copper},
  {text: 'READY — tell us what to build.', color: COLORS.fg},
];

const TypeLine = ({line, index, frame}) => {
  const start = 28 + index * 12;
  const chars = Math.floor(interpolate(frame, [start, start + 17], [0, line.text.length], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  }));
  return (
    <div style={{minHeight: 31, color: line.color, opacity: frame >= start ? 1 : 0}}>
      {line.text.slice(0, chars)}
      {frame >= start && chars < line.text.length ? <span style={{color: COLORS.copper}}>▌</span> : null}
    </div>
  );
};

const NavItem = ({icon, label, active}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 13, padding: '13px 14px', borderRadius: 12, background: active ? `${COLORS.copper}1c` : 'transparent', color: active ? COLORS.fg : COLORS.muted}}>
    <div style={{fontSize: 18, width: 24, textAlign: 'center', color: active ? COLORS.copper : COLORS.faint}}>{icon}</div>
    <div style={{fontSize: 16, fontWeight: active ? 760 : 560}}>{label}</div>
  </div>
);

export const TerminalScene = ({duration}) => {
  const frame = useCurrentFrame();
  const windowScale = scaleIn(frame, 14, {damping: 20});
  const cursorOpacity = Math.floor(frame / 12) % 2 ? 1 : 0.18;

  return (
    <SceneShell duration={duration}>
      <div style={{position: 'absolute', left: 84, top: 110, width: 620}}>
        <Kicker style={reveal(frame, 8, 24, 22)}>COMMAND CENTER</Kicker>
        <Display size={82} style={{marginTop: 24, ...reveal(frame, 15, 48, 28)}}>
          Spawn. Orchestrate. <span style={{color: COLORS.copper}}>Ship.</span>
        </Display>
        <div style={{fontSize: 27, lineHeight: 1.48, color: COLORS.muted, marginTop: 28, maxWidth: 560, ...reveal(frame, 26, 30, 26)}}>
          Live terminals and autonomous agents share the same project context—without breaking your flow.
        </div>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 32, ...reveal(frame, 37, 22, 24)}}>
          <Pill color={COLORS.cyan}>PTY TERMINALS</Pill>
          <Pill color={COLORS.plum}>AGENT HIVE</Pill>
          <Pill color={COLORS.sage}>LOCAL-FIRST</Pill>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 710,
          top: 102,
          width: 1125,
          height: 838,
          transform: `perspective(1600px) rotateY(-3deg) rotateX(1deg) scale(${0.92 + windowScale * 0.08})`,
          transformOrigin: 'center',
          ...reveal(frame, 10, 36, 30),
        }}
      >
        <WindowChrome
          title="VibeSpace — Project: UnifiedChungus"
          style={{height: '100%'}}
          toolbar={<div style={{display: 'flex', alignItems: 'center', gap: 9, color: COLORS.sage, fontSize: 15, fontWeight: 750}}><Dot /> LIVE</div>}
        >
          <div style={{display: 'flex', height: 'calc(100% - 62px)'}}>
            <div style={{width: 224, padding: 18, borderRight: '1px solid rgba(255,255,255,.07)', background: 'rgba(0,0,0,.14)'}}>
              <div style={{fontSize: 12, color: COLORS.faint, fontWeight: 800, letterSpacing: '.14em', margin: '5px 12px 14px'}}>WORKSPACE</div>
              <NavItem icon="⌁" label="Jarvis" />
              <NavItem icon=">_" label="Terminals" active />
              <NavItem icon="◈" label="Agents" />
              <NavItem icon="◎" label="Context Map" />
              <NavItem icon="◇" label="Skills" />
              <NavItem icon="⚙" label="Settings" />
              <div style={{position: 'absolute', bottom: 30, width: 185, padding: '14px 15px', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, background: 'rgba(255,255,255,.025)'}}>
                <div style={{color: COLORS.muted, fontSize: 13}}>System load</div>
                <div style={{display: 'flex', alignItems: 'end', gap: 7, marginTop: 10}}>
                  {[28, 44, 33, 58, 39, 64, 48, 70].map((h, i) => <div key={i} style={{width: 12, height: h * .55, background: i > 5 ? COLORS.copper : COLORS.sage, borderRadius: 4, opacity: .78}} />)}
                </div>
              </div>
            </div>

            <div style={{flex: 1, padding: 22, display: 'flex', flexDirection: 'column'}}>
              <div style={{display: 'flex', gap: 8, marginBottom: 16}}>
                {['Terminal 1', 'Terminal 2', 'Agent Forge'].map((name, i) => (
                  <div key={name} style={{padding: '10px 16px', borderRadius: '11px 11px 0 0', background: i === 0 ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.022)', color: i === 0 ? COLORS.fg : COLORS.faint, fontSize: 14, border: '1px solid rgba(255,255,255,.06)'}}>{name}</div>
                ))}
                <div style={{padding: '9px 13px', color: COLORS.copper, fontWeight: 900}}>＋</div>
              </div>
              <div style={{flex: 1, border: '1px solid rgba(255,255,255,.07)', borderRadius: 16, background: '#080908', padding: '25px 28px', fontFamily: FONT.mono, fontSize: 18, lineHeight: 1.72, boxShadow: 'inset 0 0 70px rgba(52,214,230,.035)'}}>
                {terminalLines.map((line, i) => <TypeLine key={line.text} line={line} index={i} frame={frame} />)}
                <div style={{marginTop: 4, color: COLORS.cyan, opacity: frame > 145 ? 1 : 0}}>$ <span style={{opacity: cursorOpacity, color: COLORS.copper}}>▌</span></div>
              </div>
              <div style={{display: 'flex', gap: 12, marginTop: 14}}>
                {[
                  ['10', 'AGENTS', COLORS.plum],
                  ['3', 'TERMINALS', COLORS.cyan],
                  ['98%', 'CONTEXT SYNC', COLORS.sage],
                  ['LOCAL', 'VOICE', COLORS.copper],
                ].map(([value, label, color]) => (
                  <div key={label} style={{flex: 1, padding: '13px 16px', borderRadius: 12, background: `${color}0d`, border: `1px solid ${color}24`}}>
                    <div style={{fontSize: 19, fontWeight: 850, color}}>{value}</div>
                    <div style={{fontSize: 11, marginTop: 3, color: COLORS.faint, letterSpacing: '.11em', fontWeight: 800}}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </WindowChrome>
      </div>
      <ProgressRail active={1} />
    </SceneShell>
  );
};
