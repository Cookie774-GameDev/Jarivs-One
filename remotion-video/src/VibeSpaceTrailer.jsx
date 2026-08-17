import React from 'react';
import {AbsoluteFill, Html5Audio, Sequence, staticFile} from 'remotion';
import {CosmicBackground} from './components';
import {HeroScene} from './scenes/HeroScene';
import {TerminalScene} from './scenes/TerminalScene';
import {VoiceScene} from './scenes/VoiceScene';
import {AgentsScene} from './scenes/AgentsScene';
import {PhoneScene} from './scenes/PhoneScene';
import {FeatureScene} from './scenes/FeatureScene';
import {FinaleScene} from './scenes/FinaleScene';

const timeline = {
  hero: {from: 0, duration: 150},
  terminal: {from: 132, duration: 210},
  voice: {from: 324, duration: 174},
  agents: {from: 480, duration: 174},
  phone: {from: 636, duration: 174},
  features: {from: 792, duration: 174},
  finale: {from: 948, duration: 132},
};

export const VibeSpaceTrailer = () => (
  <AbsoluteFill style={{backgroundColor: '#0c0a08'}}>
    <CosmicBackground />
    <Html5Audio
      src={staticFile('vibespace-score.wav')}
      volume={(frame) => {
        const fadeIn = Math.min(1, frame / 45);
        const fadeOut = Math.min(1, (1080 - frame) / 60);
        return 0.72 * Math.max(0, Math.min(fadeIn, fadeOut));
      }}
    />
    <Sequence from={timeline.hero.from} durationInFrames={timeline.hero.duration} name="Hero">
      <HeroScene duration={timeline.hero.duration} />
    </Sequence>
    <Sequence from={timeline.terminal.from} durationInFrames={timeline.terminal.duration} name="Command Center">
      <TerminalScene duration={timeline.terminal.duration} />
    </Sequence>
    <Sequence from={timeline.voice.from} durationInFrames={timeline.voice.duration} name="Jarvis Voice">
      <VoiceScene duration={timeline.voice.duration} />
    </Sequence>
    <Sequence from={timeline.agents.from} durationInFrames={timeline.agents.duration} name="Agent Council">
      <AgentsScene duration={timeline.agents.duration} />
    </Sequence>
    <Sequence from={timeline.phone.from} durationInFrames={timeline.phone.duration} name="Phone">
      <PhoneScene duration={timeline.phone.duration} />
    </Sequence>
    <Sequence from={timeline.features.from} durationInFrames={timeline.features.duration} name="Features">
      <FeatureScene duration={timeline.features.duration} />
    </Sequence>
    <Sequence from={timeline.finale.from} durationInFrames={timeline.finale.duration} name="Finale">
      <FinaleScene duration={timeline.finale.duration} />
    </Sequence>
  </AbsoluteFill>
);
