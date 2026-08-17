import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {COLORS, FONT} from './theme';

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

export const fadeScene = (frame, duration, {intro = true, outro = true} = {}) => {
  const points = [];
  const values = [];
  if (intro) {
    points.push(0, 14);
    values.push(0, 1);
  } else {
    points.push(0);
    values.push(1);
  }
  if (outro) {
    points.push(Math.max(15, duration - 18), duration);
    values.push(1, 0);
  } else {
    points.push(duration);
    values.push(1);
  }
  return interpolate(frame, points, values, {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
};

export const reveal = (frame, delay = 0, distance = 42, duration = 28) => {
  const p = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  return {
    opacity: p,
    transform: `translateY(${(1 - p) * distance}px)`,
    filter: `blur(${(1 - p) * 7}px)`,
  };
};

export const scaleIn = (frame, delay = 0, config = {}) => {
  const {fps} = useVideoConfig();
  return spring({
    frame: frame - delay,
    fps,
    config: {damping: 18, stiffness: 120, mass: 0.9, ...config},
    durationInFrames: 34,
  });
};

export const SceneShell = ({children, duration, intro = true, outro = true, style}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: fadeScene(frame, duration, {intro, outro}),
        color: COLORS.fg,
        fontFamily: FONT.body,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const CosmicBackground = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const orb = (x, y, size, color, phase, blur = 90) => ({
    position: 'absolute',
    left: x + Math.sin(t * 0.34 + phase) * 68,
    top: y + Math.cos(t * 0.28 + phase) * 52,
    width: size,
    height: size,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
    filter: `blur(${blur}px)`,
    opacity: 0.46,
    transform: `scale(${1 + Math.sin(t * 0.42 + phase) * 0.08})`,
  });

  return (
    <AbsoluteFill style={{background: COLORS.bg, overflow: 'hidden'}}>
      <div style={orb(-180, -150, 720, 'rgba(214,138,78,.60)', 0.2)} />
      <div style={orb(1370, -200, 760, 'rgba(52,214,230,.36)', 1.7, 110)} />
      <div style={orb(1250, 650, 690, 'rgba(164,114,240,.34)', 3.2, 120)} />
      <div style={orb(-260, 650, 620, 'rgba(143,184,126,.32)', 4.6, 105)} />
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'radial-gradient(circle at 50% 45%, black 0%, transparent 76%)',
          opacity: 0.55,
        }}
      />
      <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 40%, transparent 0%, rgba(12,10,8,.22) 55%, rgba(12,10,8,.92) 100%)'}} />
      <svg width="1920" height="1080" style={{position: 'absolute', inset: 0, opacity: 0.055, mixBlendMode: 'screen'}}>
        <filter id="vs-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" seed="9" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#vs-grain)" />
      </svg>
    </AbsoluteFill>
  );
};

export const LogoMark = ({size = 70, glow = true}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    style={{filter: glow ? 'drop-shadow(0 0 22px rgba(214,138,78,.35))' : undefined}}
  >
    <defs>
      <linearGradient id={`vs-logo-${size}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={COLORS.cyan} />
        <stop offset="46%" stopColor={COLORS.plum} />
        <stop offset="100%" stopColor={COLORS.copper} />
      </linearGradient>
    </defs>
    <path d="M50 5 94 26 77 85 50 98 23 85 6 26Z" fill="rgba(255,255,255,.035)" stroke="rgba(255,255,255,.16)" strokeWidth="2" />
    <path d="M20 26 43 80 50 61 36 28Z" fill={`url(#vs-logo-${size})`} />
    <path d="M80 26 57 80 50 61 64 28Z" fill={`url(#vs-logo-${size})`} opacity=".92" />
    <path d="M36 28 50 61 64 28 50 39Z" fill="#f5efe6" opacity=".94" />
  </svg>
);

export const Brand = ({compact = false, opacity = 1}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: compact ? 14 : 18, opacity}}>
    <LogoMark size={compact ? 45 : 62} />
    <div style={{fontFamily: FONT.body, fontSize: compact ? 27 : 36, fontWeight: 760, letterSpacing: '-0.04em'}}>VibeSpace</div>
  </div>
);

export const GlassPanel = ({children, style, accent = COLORS.copper}) => (
  <div
    style={{
      background: 'linear-gradient(145deg, rgba(35,29,23,.88), rgba(18,15,12,.76))',
      border: '1px solid rgba(245,239,230,.10)',
      borderRadius: 24,
      boxShadow: `0 28px 90px rgba(0,0,0,.36), 0 0 0 1px ${accent}12 inset`,
      backdropFilter: 'blur(24px)',
      overflow: 'hidden',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Pill = ({children, color = COLORS.copper, style}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 16px',
      borderRadius: 999,
      border: `1px solid ${color}55`,
      background: `${color}12`,
      color,
      fontWeight: 760,
      fontSize: 17,
      letterSpacing: '.04em',
      textTransform: 'uppercase',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Kicker = ({children, color = COLORS.copper, style}) => (
  <div style={{fontSize: 19, fontWeight: 800, color, letterSpacing: '.17em', textTransform: 'uppercase', ...style}}>{children}</div>
);

export const Display = ({children, size = 86, style}) => (
  <div
    style={{
      fontFamily: FONT.display,
      fontSize: size,
      lineHeight: 0.98,
      letterSpacing: '-0.055em',
      fontWeight: 650,
      textWrap: 'balance',
      ...style,
    }}
  >
    {children}
  </div>
);

export const GradientText = ({children, style}) => (
  <span
    style={{
      background: `linear-gradient(100deg, ${COLORS.copper} 4%, ${COLORS.amber} 32%, ${COLORS.sage} 64%, ${COLORS.cyan} 98%)`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      ...style,
    }}
  >
    {children}
  </span>
);

export const WindowChrome = ({title, children, style, toolbar}) => (
  <GlassPanel style={{...style}}>
    <div
      style={{
        height: 62,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 22px',
        borderBottom: '1px solid rgba(255,255,255,.075)',
        background: 'rgba(255,255,255,.022)',
      }}
    >
      <div style={{width: 14, height: 14, borderRadius: 99, background: '#ff6b67'}} />
      <div style={{width: 14, height: 14, borderRadius: 99, background: '#f6c451'}} />
      <div style={{width: 14, height: 14, borderRadius: 99, background: '#58d88a'}} />
      <div style={{marginLeft: 14, fontWeight: 720, color: COLORS.muted, fontSize: 18}}>{title}</div>
      <div style={{marginLeft: 'auto'}}>{toolbar}</div>
    </div>
    {children}
  </GlassPanel>
);

export const Dot = ({color = COLORS.sage, size = 10}) => (
  <span style={{display: 'inline-block', width: size, height: size, borderRadius: 99, background: color, boxShadow: `0 0 18px ${color}`}} />
);

export const ProgressRail = ({active, count = 7}) => (
  <div style={{position: 'absolute', left: 74, bottom: 56, display: 'flex', gap: 9, zIndex: 20}}>
    {Array.from({length: count}).map((_, i) => (
      <div
        key={i}
        style={{
          width: i === active ? 52 : 14,
          height: 6,
          borderRadius: 99,
          background: i === active ? COLORS.copper : 'rgba(245,239,230,.16)',
          boxShadow: i === active ? `0 0 18px ${COLORS.copper}66` : undefined,
        }}
      />
    ))}
  </div>
);
