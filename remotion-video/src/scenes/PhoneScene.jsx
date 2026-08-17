import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Display, Kicker, LogoMark, Pill, ProgressRail, SceneShell, reveal, scaleIn} from '../components';
import {COLORS, FONT} from '../theme';

const AppIcon = ({label, color, symbol}) => (
  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7}}>
    <div style={{width: 57, height: 57, borderRadius: 17, background: `linear-gradient(145deg, ${color}, #15100d)`, display: 'grid', placeItems: 'center', fontSize: 24, boxShadow: `0 12px 25px ${color}26`, border: '1px solid rgba(255,255,255,.15)'}}>{symbol}</div>
    <div style={{fontSize: 10, color: COLORS.muted}}>{label}</div>
  </div>
);

const Phone = ({frame}) => {
  const incoming = frame < 72;
  const callProgress = interpolate(frame, [72, 94], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const bannerY = interpolate(frame, [12, 28, 58, 72], [-140, 0, 0, -150], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const ring = 1 + Math.sin(frame * .2) * .025;
  return (
    <div style={{position: 'relative', width: 420, height: 830, borderRadius: 68, background: '#090807', border: '5px solid #37302a', boxShadow: '0 42px 120px rgba(0,0,0,.55), inset 0 0 0 2px rgba(255,255,255,.08)', overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 11, borderRadius: 55, overflow: 'hidden', background: 'radial-gradient(circle at 28% 18%, rgba(214,138,78,.35), transparent 38%), radial-gradient(circle at 80% 70%, rgba(52,214,230,.25), transparent 44%), linear-gradient(160deg,#18110e,#090807 62%)'}}>
        <div style={{height: 47, display: 'flex', alignItems: 'center', padding: '0 28px', fontSize: 13, fontWeight: 760}}>
          <span>3:42</span>
          <div style={{position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 9, width: 118, height: 30, borderRadius: 99, background: '#030303'}} />
          <span style={{marginLeft: 'auto', fontSize: 12}}>●●●  Wi‑Fi  ▰</span>
        </div>

        <div style={{padding: '24px 24px 0'}}>
          <div style={{fontFamily: FONT.display, fontSize: 31, fontWeight: 650}}>VibeSpace</div>
          <div style={{fontSize: 13, color: COLORS.muted, marginTop: 4}}>Monday · Build night</div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '23px 14px', marginTop: 34}}>
            <AppIcon label="Calls" color={COLORS.cyan} symbol="☎" />
            <AppIcon label="Messages" color={COLORS.sage} symbol="✦" />
            <AppIcon label="Browser" color={COLORS.plum} symbol="◎" />
            <AppIcon label="Context" color={COLORS.copper} symbol="◇" />
            <AppIcon label="Agents" color="#ef8062" symbol="◈" />
            <AppIcon label="Terminal" color="#4ab98c" symbol=">_" />
            <AppIcon label="Files" color="#6e9cea" symbol="▤" />
            <AppIcon label="Settings" color="#807b77" symbol="⚙" />
          </div>
          <div style={{marginTop: 40, padding: '18px 20px', borderRadius: 22, background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.08)'}}>
            <div style={{fontSize: 12, color: COLORS.copper, fontWeight: 800}}>BUILD STATUS</div>
            <div style={{fontSize: 19, marginTop: 8}}>UnifiedChungus is healthy</div>
            <div style={{display: 'flex', gap: 6, marginTop: 14}}>
              {[36, 52, 44, 68, 56, 78, 62, 83, 71, 92].map((h, i) => <div key={i} style={{width: 22, height: h * .32, borderRadius: 5, background: i > 6 ? COLORS.sage : COLORS.copper, opacity: .8}} />)}
            </div>
          </div>
        </div>

        {incoming && (
          <div style={{position: 'absolute', left: 17, right: 17, top: 48, transform: `translateY(${bannerY}px)`, borderRadius: 25, padding: '18px 18px 17px', background: 'rgba(26,22,18,.96)', border: `1px solid ${COLORS.copper}48`, boxShadow: '0 24px 60px rgba(0,0,0,.55)', backdropFilter: 'blur(18px)'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
              <div style={{width: 53, height: 53, borderRadius: 18, background: `radial-gradient(circle at 35% 30%, ${COLORS.cyan}, ${COLORS.plum} 40%, ${COLORS.copperDeep})`, display: 'grid', placeItems: 'center'}}><LogoMark size={38} glow={false} /></div>
              <div>
                <div style={{fontSize: 12, color: COLORS.copper, fontWeight: 800, letterSpacing: '.08em'}}>INCOMING VIBESPACE CALL</div>
                <div style={{fontSize: 21, fontWeight: 760, marginTop: 4}}>Jarvis</div>
              </div>
            </div>
            <div style={{display: 'flex', gap: 12, marginTop: 16}}>
              <div style={{flex: 1, textAlign: 'center', padding: '12px', borderRadius: 999, background: 'rgba(255,94,103,.18)', color: COLORS.red, fontWeight: 800}}>Decline</div>
              <div style={{flex: 1, textAlign: 'center', padding: '12px', borderRadius: 999, background: `${COLORS.sage}2a`, color: COLORS.sage, fontWeight: 800}}>Answer</div>
            </div>
          </div>
        )}

        <div style={{position: 'absolute', inset: 0, opacity: callProgress, pointerEvents: 'none', background: 'radial-gradient(circle at 50% 28%, rgba(164,114,240,.35), transparent 47%), linear-gradient(180deg,#17100f,#080706)'}}>
          <div style={{paddingTop: 102, textAlign: 'center'}}>
            <div style={{fontSize: 13, color: COLORS.sage, fontWeight: 800, letterSpacing: '.12em'}}>VIBESPACE SECURE CALL</div>
            <div style={{margin: '34px auto 0', width: 172, height: 172, borderRadius: '50%', transform: `scale(${ring})`, display: 'grid', placeItems: 'center', background: `radial-gradient(circle at 35% 30%, ${COLORS.cyan}, ${COLORS.plum} 42%, ${COLORS.copperDeep})`, boxShadow: `0 0 70px ${COLORS.plum}66`}}><LogoMark size={108} /></div>
            <div style={{fontFamily: FONT.display, fontSize: 39, marginTop: 26}}>Jarvis</div>
            <div style={{fontSize: 15, color: COLORS.muted, marginTop: 7}}>00:0{Math.max(1, Math.floor((frame - 72) / 30))}</div>
            <div style={{margin: '34px 32px 0', padding: '20px', borderRadius: 20, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', fontSize: 17, lineHeight: 1.44, color: COLORS.fg}}>
              “Your build finished. All checks passed, and the release is ready for review.”
            </div>
            <div style={{display: 'flex', justifyContent: 'center', gap: 24, marginTop: 44}}>
              {['◉', '⌁', '▦'].map((x) => <div key={x} style={{width: 61, height: 61, borderRadius: 99, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.09)', fontSize: 23}}>{x}</div>)}
            </div>
            <div style={{margin: '34px auto 0', width: 69, height: 69, borderRadius: 99, display: 'grid', placeItems: 'center', background: COLORS.red, boxShadow: `0 0 28px ${COLORS.red}55`, fontSize: 29}}>×</div>
          </div>
        </div>

        <div style={{position: 'absolute', left: '50%', bottom: 9, transform: 'translateX(-50%)', width: 126, height: 5, borderRadius: 99, background: 'rgba(255,255,255,.72)'}} />
      </div>
      <div style={{position: 'absolute', left: -7, top: 180, width: 5, height: 86, borderRadius: '4px 0 0 4px', background: '#40362f'}} />
      <div style={{position: 'absolute', right: -7, top: 230, width: 5, height: 116, borderRadius: '0 4px 4px 0', background: '#40362f'}} />
    </div>
  );
};

export const PhoneScene = ({duration}) => {
  const frame = useCurrentFrame();
  const phoneScale = scaleIn(frame, 9, {damping: 19});
  return (
    <SceneShell duration={duration}>
      <div style={{position: 'absolute', left: 92, top: 143, width: 745}}>
        <Kicker color={COLORS.sage} style={reveal(frame, 6, 24, 22)}>VIBESPACE ON THE GO</Kicker>
        <Display size={91} style={{marginTop: 22, ...reveal(frame, 13, 50, 28)}}>
          Your workspace can <span style={{color: COLORS.cyan}}>call you.</span>
        </Display>
        <div style={{fontSize: 28, color: COLORS.muted, lineHeight: 1.5, marginTop: 28, maxWidth: 650, ...reveal(frame, 25, 28, 25)}}>
          Calls, messages, live captions, agents, browser, and build status—synced across desktop and mobile.
        </div>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 34, ...reveal(frame, 37, 22, 24)}}>
          <Pill color={COLORS.cyan}>AI CALLS</Pill>
          <Pill color={COLORS.sage}>LIVE CAPTIONS</Pill>
          <Pill color={COLORS.plum}>SYNCED CONTEXT</Pill>
        </div>
        <div style={{marginTop: 46, padding: '22px 24px', width: 590, borderRadius: 20, border: '1px solid rgba(255,255,255,.09)', background: 'rgba(255,255,255,.035)', ...reveal(frame, 58, 18, 24)}}>
          <div style={{fontSize: 14, color: COLORS.copper, fontWeight: 850, letterSpacing: '.1em'}}>THE MOMENT THAT SELLS IT</div>
          <div style={{fontFamily: FONT.display, fontSize: 30, marginTop: 10, lineHeight: 1.2}}>The AI does not just answer. It reaches you.</div>
        </div>
      </div>

      <div style={{position: 'absolute', right: 250, top: 70, transform: `perspective(1400px) rotateY(-8deg) rotateX(1deg) scale(${.9 + phoneScale * .1})`, transformOrigin: 'center', ...reveal(frame, 8, 30, 28)}}>
        <Phone frame={frame} />
      </div>
      <div style={{position: 'absolute', right: 76, top: 305, width: 230, padding: '18px 20px', borderRadius: 19, background: 'rgba(25,21,17,.9)', border: `1px solid ${COLORS.cyan}35`, boxShadow: '0 24px 60px rgba(0,0,0,.35)', ...reveal(frame, 46, 20, 25)}}>
        <div style={{fontSize: 12, color: COLORS.cyan, fontWeight: 850, letterSpacing: '.1em'}}>LIVE SYNC</div>
        <div style={{fontSize: 18, lineHeight: 1.35, marginTop: 8}}>Desktop build finished on your phone.</div>
      </div>
      <ProgressRail active={4} />
    </SceneShell>
  );
};
