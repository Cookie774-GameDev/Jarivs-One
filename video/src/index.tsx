import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import React, {type CSSProperties, type ReactNode} from 'react';
import {
  AbsoluteFill,
  Composition,
  Easing,
  Img,
  Sequence,
  interpolate,
  registerRoot,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const FPS = 30;
const DURATION = 30 * FPS;
const SCENE_STEP = 5 * FPS;
const SCENE_OVERLAP = 15;

const palette = {
  ground: '#E9D4B7',
  paper: '#F8E9D1',
  paperEdge: '#FFF7E8',
  ink: '#3B2A20',
  muted: '#705B4D',
  coral: '#DF846F',
  coralDeep: '#B65E50',
  lavender: '#947DB7',
  sage: '#879A7C',
  blue: '#7F98AA',
  ochre: '#C98C42',
  indigo: '#302E4D',
} as const;

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;

const fadeEnvelope = (frame: number, duration: number, keepEnd = false) => {
  const fadeIn = interpolate(frame, [0, 18], [0, 1], clamp);
  const fadeOut = keepEnd
    ? 1
    : interpolate(frame, [duration - 18, duration], [1, 0], clamp);
  return fadeIn * fadeOut;
};

const paperCut =
  'polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px))';

const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 75) * 24;
  const driftY = Math.cos(frame / 92) * 18;

  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        background: `
          radial-gradient(circle at ${16 + drift / 20}% ${10 + driftY / 24}%, rgba(255,247,232,.95), transparent 30%),
          radial-gradient(circle at 82% 12%, rgba(148,125,183,.20), transparent 34%),
          radial-gradient(circle at 14% 85%, rgba(135,154,124,.19), transparent 34%),
          linear-gradient(135deg, #F2E1C9 0%, ${palette.ground} 52%, #DFC5A3 100%)
        `,
      }}
    >
      <AbsoluteFill
        style={{
          opacity: 0.34,
          backgroundImage: `
            linear-gradient(rgba(255,247,232,.46) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,247,232,.46) 1px, transparent 1px)
          `,
          backgroundSize: '72px 72px',
          transform: `translate(${drift * 0.18}px, ${driftY * 0.18}px)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.16,
          backgroundImage:
            'repeating-linear-gradient(14deg, rgba(90,62,43,.12) 0 1px, transparent 1px 9px)',
          mixBlendMode: 'multiply',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '0 auto 0 0',
          width: 26,
          background: `repeating-linear-gradient(148deg, ${palette.indigo} 0 30px, ${palette.lavender} 30px 60px, ${palette.coral} 60px 90px, ${palette.ochre} 90px 120px, ${palette.sage} 120px 150px, ${palette.blue} 150px 180px)`,
          clipPath:
            'polygon(0 0, 100% 0, 72% 8%, 100% 16%, 70% 24%, 100% 32%, 72% 40%, 100% 48%, 70% 56%, 100% 64%, 72% 72%, 100% 80%, 70% 88%, 100% 96%, 72% 100%, 0 100%)',
          boxShadow: '6px 0 18px rgba(66,42,27,.20)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 26,
          width: 360,
          height: 11,
          background: `linear-gradient(90deg, ${palette.coral} 0 28%, ${palette.lavender} 28% 52%, ${palette.sage} 52% 74%, ${palette.ochre} 74%)`,
          clipPath:
            'polygon(0 0, 100% 0, 96% 100%, 68% 55%, 48% 100%, 28% 55%, 0 100%)',
          filter: 'drop-shadow(0 4px 4px rgba(66,42,27,.16))',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 110,
          right: 0,
          width: 16,
          height: 720,
          background: `linear-gradient(180deg, ${palette.lavender}, ${palette.coral} 38%, ${palette.sage} 72%, ${palette.blue})`,
          clipPath:
            'polygon(35% 0, 100% 0, 100% 100%, 25% 100%, 0 91%, 38% 82%, 0 73%, 38% 64%, 0 55%, 38% 46%, 0 37%, 38% 28%, 0 19%, 38% 10%)',
        }}
      />
    </AbsoluteFill>
  );
};

const BrandMark: React.FC<{size?: number}> = ({size = 112}) => (
  <div
    style={{
      position: 'relative',
      width: size,
      height: size,
      filter: 'drop-shadow(12px 16px 20px rgba(70,45,28,.18))',
    }}
  >
    <div
      style={{
        position: 'absolute',
        inset: size * 0.08,
        borderRadius: size * 0.1,
        background: palette.lavender,
        transform: 'rotate(12deg)',
        clipPath: paperCut,
      }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: size * 0.1,
        background: `linear-gradient(145deg, #EE9A83, ${palette.coral} 65%, ${palette.coralDeep})`,
        transform: 'rotate(-5deg)',
        clipPath: paperCut,
        boxShadow: 'inset 2px 2px rgba(255,247,232,.55)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        color: palette.paperEdge,
        fontFamily: 'Fraunces, serif',
        fontWeight: 700,
        fontSize: size * 0.56,
        transform: 'rotate(-5deg) translateY(-2%)',
      }}
    >
      V
    </div>
  </div>
);

const SceneShell: React.FC<{
  children: ReactNode;
  duration: number;
  keepEnd?: boolean;
}> = ({children, duration, keepEnd = false}) => {
  const frame = useCurrentFrame();
  const opacity = fadeEnvelope(frame, duration, keepEnd);
  const scale = interpolate(frame, [0, duration], [1.018, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: 'center',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Kicker: React.FC<{children: ReactNode; accent?: string}> = ({
  children,
  accent = palette.coral,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      color: palette.muted,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 20,
      fontWeight: 500,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
    }}
  >
    <span style={{width: 42, height: 5, borderRadius: 999, background: accent}} />
    {children}
  </div>
);

const FeatureChip: React.FC<{
  label: string;
  index: number;
  frame: number;
  color: string;
}> = ({label, index, frame, color}) => {
  const pop = spring({
    fps: FPS,
    frame: frame - 72 - index * 5,
    config: {damping: 14, stiffness: 130, mass: 0.7},
  });

  return (
    <div
      style={{
        padding: '15px 22px',
        background: 'rgba(255,247,232,.82)',
        border: '1px solid rgba(77,52,38,.18)',
        boxShadow: '0 10px 22px rgba(75,49,29,.10)',
        clipPath: paperCut,
        transform: `translateY(${(1 - pop) * 30}px) scale(${0.85 + pop * 0.15})`,
        opacity: pop,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontWeight: 700,
        fontSize: 22,
        color: palette.ink,
      }}
    >
      <span style={{color, marginRight: 10}}>●</span>
      {label}
    </div>
  );
};

const ScreenshotCard: React.FC<{
  src: string;
  label: string;
  frame: number;
  delay?: number;
  width: number;
  height: number;
  rotate?: number;
  objectPosition?: string;
  style?: CSSProperties;
}> = ({
  src,
  label,
  frame,
  delay = 0,
  width,
  height,
  rotate = 0,
  objectPosition = 'center',
  style,
}) => {
  const enter = spring({
    fps: FPS,
    frame: frame - delay,
    config: {damping: 18, stiffness: 115, mass: 0.8},
  });

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        padding: 14,
        background: palette.paperEdge,
        border: '1px solid rgba(77,52,38,.22)',
        boxShadow: '0 30px 70px rgba(75,49,29,.20), 0 8px 18px rgba(75,49,29,.12)',
        clipPath: paperCut,
        transform: `translateY(${(1 - enter) * 80}px) rotate(${rotate + (1 - enter) * 2}deg) scale(${0.92 + enter * 0.08})`,
        opacity: enter,
        overflow: 'hidden',
        ...style,
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition,
          borderRadius: 8,
          border: '1px solid rgba(48,46,77,.18)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 28,
          left: 28,
          padding: '10px 14px',
          background: 'rgba(48,46,77,.88)',
          color: palette.paperEdge,
          borderRadius: 3,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 15,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          boxShadow: '0 8px 20px rgba(0,0,0,.18)',
        }}
      >
        {label}
      </div>
    </div>
  );
};

const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = spring({
    fps: FPS,
    frame: frame - 4,
    config: {damping: 12, stiffness: 95, mass: 0.9},
  });
  const title = spring({
    fps: FPS,
    frame: frame - 18,
    config: {damping: 18, stiffness: 110},
  });

  return (
    <SceneShell duration={SCENE_STEP + SCENE_OVERLAP}>
      <AbsoluteFill style={{padding: '120px 150px 105px 170px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 58}}>
          <div
            style={{
              transform: `translateY(${(1 - logo) * 70}px) rotate(${(1 - logo) * -10}deg) scale(${0.72 + logo * 0.28})`,
              opacity: logo,
            }}
          >
            <BrandMark size={154} />
          </div>
          <div
            style={{
              transform: `translateX(${(1 - title) * 58}px)`,
              opacity: title,
            }}
          >
            <Kicker>Introducing</Kicker>
            <div
              style={{
                marginTop: 10,
                fontFamily: 'Fraunces, serif',
                fontSize: 152,
                lineHeight: 0.88,
                fontWeight: 700,
                color: palette.ink,
                letterSpacing: '-0.055em',
              }}
            >
              VibeSpace
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 86,
            maxWidth: 1490,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: 55,
            lineHeight: 1.15,
            fontWeight: 600,
            letterSpacing: '-0.035em',
            color: palette.ink,
            transform: `translateY(${(1 - title) * 42}px)`,
            opacity: title,
          }}
        >
          The AI workspace where every model, agent, voice, and task lives{' '}
          <span style={{color: palette.coralDeep}}>under one roof.</span>
        </div>

        <div style={{display: 'flex', gap: 18, marginTop: 72, flexWrap: 'wrap'}}>
          {[
            ['Models', palette.coral],
            ['Agents', palette.lavender],
            ['Voice', palette.sage],
            ['Tasks', palette.blue],
            ['Memory', palette.ochre],
          ].map(([label, color], index) => (
            <FeatureChip
              key={label}
              label={label}
              color={color}
              index={index}
              frame={frame}
            />
          ))}
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

const ProviderBadge: React.FC<{
  name: string;
  index: number;
  frame: number;
  color: string;
}> = ({name, index, frame, color}) => {
  const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2 + frame / 420;
  const radiusX = 285;
  const radiusY = 210;
  const pop = spring({
    fps: FPS,
    frame: frame - 20 - index * 4,
    config: {damping: 17, stiffness: 125, mass: 0.7},
  });
  const x = Math.cos(angle) * radiusX;
  const y = Math.sin(angle) * radiusY;

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 170,
        padding: '16px 18px',
        transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${pop})`,
        opacity: pop,
        background: 'rgba(255,247,232,.94)',
        border: '1px solid rgba(77,52,38,.18)',
        borderLeft: `8px solid ${color}`,
        boxShadow: '0 14px 28px rgba(75,49,29,.13)',
        clipPath: paperCut,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: 20,
        fontWeight: 700,
        color: palette.ink,
        textAlign: 'center',
      }}
    >
      {name}
    </div>
  );
};

const ModelsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const title = spring({
    fps: FPS,
    frame: frame - 8,
    config: {damping: 18, stiffness: 105},
  });
  const hub = spring({
    fps: FPS,
    frame: frame - 18,
    config: {damping: 15, stiffness: 105, mass: 0.8},
  });

  return (
    <SceneShell duration={SCENE_STEP + SCENE_OVERLAP}>
      <AbsoluteFill style={{padding: '104px 115px 90px 155px'}}>
        <div style={{display: 'grid', gridTemplateColumns: '0.86fr 1.14fr', gap: 68, height: '100%'}}>
          <div style={{alignSelf: 'center', transform: `translateX(${(1 - title) * -52}px)`, opacity: title}}>
            <Kicker accent={palette.lavender}>One workspace</Kicker>
            <h1
              style={{
                margin: '24px 0 0',
                fontFamily: 'Fraunces, serif',
                fontSize: 100,
                lineHeight: 0.94,
                letterSpacing: '-0.055em',
                color: palette.ink,
              }}
            >
              Every model.
              <br />
              <span style={{color: palette.lavender}}>One memory.</span>
            </h1>
            <p
              style={{
                margin: '38px 0 0',
                maxWidth: 650,
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: 31,
                lineHeight: 1.45,
                color: palette.muted,
              }}
            >
              Switch providers, convene agent councils, and keep the context moving with you.
            </p>
            <div
              style={{
                display: 'inline-flex',
                marginTop: 44,
                padding: '18px 24px',
                background: palette.indigo,
                color: palette.paperEdge,
                clipPath: paperCut,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 24,
                letterSpacing: '0.05em',
              }}
            >
              21+ MODEL PROVIDERS
            </div>
          </div>

          <div style={{position: 'relative', display: 'grid', placeItems: 'center'}}>
            <div
              style={{
                position: 'absolute',
                width: 720,
                height: 570,
                borderRadius: '50%',
                border: '1px dashed rgba(77,52,38,.24)',
                transform: `scale(${0.84 + hub * 0.16}) rotate(${frame / 9}deg)`,
                opacity: hub * 0.7,
              }}
            />
            <div
              style={{
                position: 'relative',
                zIndex: 2,
                width: 300,
                height: 300,
                display: 'grid',
                placeItems: 'center',
                background: `linear-gradient(145deg, ${palette.paperEdge}, ${palette.paper})`,
                border: '1px solid rgba(77,52,38,.22)',
                boxShadow: '0 30px 80px rgba(75,49,29,.18)',
                clipPath: paperCut,
                transform: `scale(${hub}) rotate(${(1 - hub) * -12}deg)`,
                opacity: hub,
              }}
            >
              <div style={{display: 'grid', placeItems: 'center', gap: 12}}>
                <BrandMark size={110} />
                <div
                  style={{
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                    fontSize: 26,
                    fontWeight: 700,
                    color: palette.ink,
                    letterSpacing: '-0.03em',
                  }}
                >
                  ONE WORKSPACE
                </div>
              </div>
            </div>
            {[
              ['OpenAI', palette.coral],
              ['Anthropic', palette.ochre],
              ['Gemini', palette.blue],
              ['Ollama', palette.sage],
              ['Groq', palette.lavender],
              ['Local', palette.indigo],
            ].map(([name, color], index) => (
              <ProviderBadge key={name} name={name} color={color} index={index} frame={frame} />
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

const CodeStrip: React.FC<{
  text: string;
  top: number;
  left: number;
  frame: number;
  delay: number;
  color: string;
}> = ({text, top, left, frame, delay, color}) => {
  const enter = spring({
    fps: FPS,
    frame: frame - delay,
    config: {damping: 18, stiffness: 125},
  });
  const drift = Math.sin((frame + delay) / 18) * 8;

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        padding: '13px 18px',
        background: palette.indigo,
        borderLeft: `7px solid ${color}`,
        color: '#F7EEDF',
        boxShadow: '0 12px 28px rgba(48,46,77,.22)',
        clipPath: paperCut,
        transform: `translateX(${(1 - enter) * -80 + drift}px) scale(${0.92 + enter * 0.08})`,
        opacity: enter,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 18,
      }}
    >
      {text}
    </div>
  );
};

const TerminalsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const title = spring({
    fps: FPS,
    frame: frame - 6,
    config: {damping: 18, stiffness: 110},
  });

  return (
    <SceneShell duration={SCENE_STEP + SCENE_OVERLAP}>
      <AbsoluteFill style={{padding: '80px 105px 80px 145px'}}>
        <div style={{position: 'absolute', top: 82, left: 154, zIndex: 5, opacity: title}}>
          <Kicker accent={palette.sage}>Terminal swarm</Kicker>
          <h1
            style={{
              margin: '16px 0 0',
              fontFamily: 'Fraunces, serif',
              fontSize: 78,
              lineHeight: 0.95,
              letterSpacing: '-0.05em',
              color: palette.ink,
              transform: `translateY(${(1 - title) * 34}px)`,
            }}
          >
            Ten live panes.
            <br />
            <span style={{color: palette.sage}}>One approval.</span>
          </h1>
        </div>

        <ScreenshotCard
          src="terminals.png"
          label="Real app preview / terminal grid"
          frame={frame}
          delay={18}
          width={1350}
          height={760}
          rotate={-1.25}
          objectPosition="center"
          style={{position: 'absolute', right: 105, bottom: 62}}
        />

        <CodeStrip text="claude --role builder" top={510} left={92} frame={frame} delay={42} color={palette.coral} />
        <CodeStrip text="codex --role reviewer" top={590} left={116} frame={frame} delay={49} color={palette.lavender} />
        <CodeStrip text="opencode run" top={670} left={88} frame={frame} delay={56} color={palette.ochre} />
        <CodeStrip text="shell / local" top={750} left={124} frame={frame} delay={63} color={palette.blue} />

        <div
          style={{
            position: 'absolute',
            right: 126,
            top: 105,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '15px 21px',
            background: 'rgba(255,247,232,.92)',
            border: '1px solid rgba(77,52,38,.18)',
            boxShadow: '0 10px 24px rgba(75,49,29,.12)',
            clipPath: paperCut,
            opacity: title,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: 21,
            fontWeight: 700,
            color: palette.ink,
          }}
        >
          <span style={{color: palette.sage}}>●</span> OPEN · BRIEF · RUN · REVIEW
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

const Waveform: React.FC<{frame: number}> = ({frame}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 10, height: 66}}>
    {Array.from({length: 13}).map((_, index) => {
      const height = 18 + Math.abs(Math.sin(frame / 5 + index * 0.72)) * 46;
      return (
        <div
          key={index}
          style={{
            width: 10,
            height,
            borderRadius: 999,
            background: index % 3 === 0 ? palette.coral : index % 3 === 1 ? palette.lavender : palette.sage,
          }}
        />
      );
    })}
  </div>
);

const VoiceScene: React.FC = () => {
  const frame = useCurrentFrame();
  const title = spring({
    fps: FPS,
    frame: frame - 5,
    config: {damping: 18, stiffness: 110},
  });
  const pulse = 1 + Math.sin(frame / 7) * 0.04;

  return (
    <SceneShell duration={SCENE_STEP + SCENE_OVERLAP}>
      <AbsoluteFill style={{padding: '78px 105px 78px 145px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
          <div style={{opacity: title, transform: `translateY(${(1 - title) * 30}px)`}}>
            <Kicker accent={palette.coral}>Jarvis voice + dictation</Kicker>
            <h1
              style={{
                margin: '16px 0 0',
                fontFamily: 'Fraunces, serif',
                fontSize: 86,
                lineHeight: 0.94,
                letterSpacing: '-0.055em',
                color: palette.ink,
              }}
            >
              Talk. Dictate.
              <br />
              <span style={{color: palette.coralDeep}}>Interrupt.</span>
            </h1>
          </div>
          <div
            style={{
              marginTop: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              padding: '18px 26px',
              background: palette.indigo,
              color: palette.paperEdge,
              clipPath: paperCut,
              boxShadow: '0 16px 34px rgba(48,46,77,.22)',
              transform: `scale(${pulse})`,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 25,
              letterSpacing: '0.08em',
            }}
          >
            CTRL + SPACE
            <Waveform frame={frame} />
          </div>
        </div>

        <div style={{position: 'absolute', left: 150, right: 105, bottom: 74, height: 620}}>
          <ScreenshotCard
            src="dictation-overlay.png"
            label="Real app preview / dictation overlay"
            frame={frame}
            delay={18}
            width={980}
            height={610}
            rotate={-1.4}
            style={{position: 'absolute', left: 0, bottom: 0}}
          />
          <ScreenshotCard
            src="voice-settings.png"
            label="Real app preview / voice settings"
            frame={frame}
            delay={34}
            width={760}
            height={520}
            rotate={1.8}
            style={{position: 'absolute', right: 0, bottom: 34}}
          />
        </div>

        <div
          style={{
            position: 'absolute',
            right: 126,
            bottom: 52,
            padding: '14px 20px',
            background: palette.paperEdge,
            border: '1px solid rgba(77,52,38,.18)',
            clipPath: paperCut,
            boxShadow: '0 12px 28px rgba(75,49,29,.12)',
            color: palette.muted,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          Local Kokoro · Deepgram cloud · stop mid-reply
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

const MapNode: React.FC<{
  x: number;
  y: number;
  label: string;
  frame: number;
  delay: number;
  color: string;
}> = ({x, y, label, frame, delay, color}) => {
  const pop = spring({
    fps: FPS,
    frame: frame - delay,
    config: {damping: 14, stiffness: 150, mass: 0.6},
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${pop})`,
        opacity: pop,
        padding: '10px 14px',
        borderRadius: 999,
        background: color,
        color: palette.paperEdge,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 14,
        boxShadow: '0 10px 22px rgba(48,46,77,.18)',
      }}
    >
      {label}
    </div>
  );
};

const ActionsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const title = spring({
    fps: FPS,
    frame: frame - 4,
    config: {damping: 18, stiffness: 110},
  });
  const lineWidth = interpolate(frame, [40, 105], [0, 100], clamp);

  return (
    <SceneShell duration={SCENE_STEP + SCENE_OVERLAP}>
      <AbsoluteFill style={{padding: '78px 105px 76px 145px'}}>
        <div style={{opacity: title, transform: `translateY(${(1 - title) * 30}px)`}}>
          <Kicker accent={palette.ochre}>Actions + context</Kicker>
          <h1
            style={{
              margin: '15px 0 0',
              fontFamily: 'Fraunces, serif',
              fontSize: 82,
              lineHeight: 0.94,
              letterSpacing: '-0.055em',
              color: palette.ink,
            }}
          >
            Actions that run.
            <br />
            <span style={{color: palette.ochre}}>Context that stays.</span>
          </h1>
        </div>

        <div style={{position: 'absolute', left: 145, right: 100, bottom: 68, height: 635}}>
          <ScreenshotCard
            src="app-schedule.png"
            label="Real app preview / Jarvis Actions"
            frame={frame}
            delay={18}
            width={910}
            height={590}
            rotate={-1.1}
            style={{position: 'absolute', left: 0, bottom: 0}}
          />
          <ScreenshotCard
            src="app-context-map.png"
            label="Real app preview / Context Map"
            frame={frame}
            delay={30}
            width={900}
            height={590}
            rotate={1.15}
            style={{position: 'absolute', right: 0, bottom: 0}}
          />

          <div
            style={{
              position: 'absolute',
              left: 770,
              top: 230,
              width: 310,
              height: 8,
              borderRadius: 999,
              background: `linear-gradient(90deg, ${palette.coral}, ${palette.lavender}, ${palette.sage})`,
              transformOrigin: 'left center',
              transform: `scaleX(${lineWidth / 100}) rotate(-3deg)`,
              boxShadow: '0 0 18px rgba(223,132,111,.38)',
            }}
          />
          <MapNode x={1130} y={160} label="project" frame={frame} delay={46} color={palette.lavender} />
          <MapNode x={1265} y={255} label="memory" frame={frame} delay={54} color={palette.sage} />
          <MapNode x={1115} y={350} label="files" frame={frame} delay={62} color={palette.blue} />
          <MapNode x={1375} y={375} label="agents" frame={frame} delay={70} color={palette.coral} />
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

const ClosingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = spring({
    fps: FPS,
    frame: frame - 4,
    config: {damping: 18, stiffness: 100, mass: 0.85},
  });
  const screenshot = interpolate(frame, [0, 65, 145], [0.2, 0.38, 0.28], clamp);
  const glow = 0.92 + Math.sin(frame / 12) * 0.04;

  return (
    <SceneShell duration={SCENE_STEP} keepEnd>
      <AbsoluteFill>
        <Img
          src={staticFile('app-chat.png')}
          style={{
            position: 'absolute',
            inset: 70,
            width: 'calc(100% - 140px)',
            height: 'calc(100% - 140px)',
            objectFit: 'cover',
            borderRadius: 24,
            opacity: screenshot,
            filter: 'saturate(.7) sepia(.12) blur(1px)',
            boxShadow: '0 34px 90px rgba(75,49,29,.22)',
          }}
        />
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(90deg, rgba(233,212,183,.94), rgba(233,212,183,.70) 50%, rgba(233,212,183,.92))',
          }}
        />

        <AbsoluteFill style={{display: 'grid', placeItems: 'center'}}>
          <div
            style={{
              width: 1320,
              padding: '72px 90px 68px',
              textAlign: 'center',
              background: 'rgba(255,247,232,.88)',
              border: '1px solid rgba(77,52,38,.20)',
              boxShadow: '0 36px 90px rgba(75,49,29,.20)',
              clipPath: paperCut,
              transform: `translateY(${(1 - enter) * 70}px) scale(${(0.9 + enter * 0.1) * glow})`,
              opacity: enter,
            }}
          >
            <div style={{display: 'flex', justifyContent: 'center', marginBottom: 26}}>
              <BrandMark size={124} />
            </div>
            <div
              style={{
                fontFamily: 'Fraunces, serif',
                fontSize: 126,
                lineHeight: 0.9,
                fontWeight: 700,
                letterSpacing: '-0.06em',
                color: palette.ink,
              }}
            >
              VibeSpace
            </div>
            <div
              style={{
                marginTop: 30,
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: 45,
                fontWeight: 600,
                letterSpacing: '-0.035em',
                color: palette.ink,
              }}
            >
              Every model. Every agent. <span style={{color: palette.coralDeep}}>One memory.</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 18,
                marginTop: 46,
                flexWrap: 'wrap',
              }}
            >
              {['LOCAL-FIRST', 'VOICE-READY', 'AGENT-NATIVE'].map((label, index) => (
                <div
                  key={label}
                  style={{
                    padding: '13px 18px',
                    background: index === 0 ? palette.sage : index === 1 ? palette.coral : palette.lavender,
                    color: palette.paperEdge,
                    borderRadius: 999,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 17,
                    letterSpacing: '0.08em',
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 44,
                display: 'flex',
                justifyContent: 'center',
                gap: 36,
                color: palette.muted,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 22,
              }}
            >
              <span>vibespaceos.com</span>
              <span style={{color: palette.coral}}>◆</span>
              <span>github.com/Cookie774-GameDev/VibeSpace</span>
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </SceneShell>
  );
};

const FrameChrome: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const seconds = Math.min(Math.floor(frame / fps), 29);
  const frames = frame % fps;
  const progress = (frame / (durationInFrames - 1)) * 100;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          top: 34,
          left: 70,
          color: palette.muted,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 16,
          letterSpacing: '0.12em',
        }}
      >
        VIBESPACE / 30-SECOND PRODUCT FILM
      </div>
      <div
        style={{
          position: 'absolute',
          right: 58,
          bottom: 35,
          color: palette.muted,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 16,
          letterSpacing: '0.08em',
        }}
      >
        00:{String(seconds).padStart(2, '0')}:{String(frames).padStart(2, '0')}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 70,
          right: 70,
          bottom: 35,
          height: 4,
          background: 'rgba(77,52,38,.13)',
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${palette.coral}, ${palette.lavender}, ${palette.sage}, ${palette.blue})`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

export const VibeSpacePromo: React.FC = () => (
  <AbsoluteFill style={{background: palette.ground}}>
    <Backdrop />
    <Sequence from={0} durationInFrames={SCENE_STEP + SCENE_OVERLAP}>
      <IntroScene />
    </Sequence>
    <Sequence from={SCENE_STEP} durationInFrames={SCENE_STEP + SCENE_OVERLAP}>
      <ModelsScene />
    </Sequence>
    <Sequence from={SCENE_STEP * 2} durationInFrames={SCENE_STEP + SCENE_OVERLAP}>
      <TerminalsScene />
    </Sequence>
    <Sequence from={SCENE_STEP * 3} durationInFrames={SCENE_STEP + SCENE_OVERLAP}>
      <VoiceScene />
    </Sequence>
    <Sequence from={SCENE_STEP * 4} durationInFrames={SCENE_STEP + SCENE_OVERLAP}>
      <ActionsScene />
    </Sequence>
    <Sequence from={SCENE_STEP * 5} durationInFrames={SCENE_STEP}>
      <ClosingScene />
    </Sequence>
    <FrameChrome />
  </AbsoluteFill>
);

const RemotionRoot: React.FC = () => (
  <Composition
    id="VibeSpacePromo"
    component={VibeSpacePromo}
    durationInFrames={DURATION}
    fps={FPS}
    width={1920}
    height={1080}
  />
);

registerRoot(RemotionRoot);
