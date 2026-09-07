// Microphone permission is requested only in start(), directly from a user click.
export function createVoice() {
  const $ = (id) => document.getElementById(id);
  if (!$('voice-start'))
    return {
      tick() {},
      stop() {},
      get active() {
        return false;
      },
    };
  let generation = 0,
    stream,
    context,
    analyser,
    recognition,
    utterance,
    timer,
    active = false,
    sample = false,
    bins;
  const bars = [...document.querySelectorAll('.waveform i')];
  const orb = document.querySelector('.voice-orb');
  const setStatus = (text) => ($('voice-state').textContent = text);
  function release() {
    generation++;
    clearTimeout(timer);
    active = false;
    sample = false;
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.abort();
      recognition = null;
    }
    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
      window.speechSynthesis?.cancel();
      utterance = null;
    }
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (context) context.close().catch(() => {});
    context = null;
    analyser = null;
    $('voice-pause').disabled = true;
    bars.forEach((bar) => (bar.style.transform = 'scaleY(.12)'));
    orb.style.transform = '';
  }
  function stop(message = 'Paused. Microphone off.') {
    release();
    setStatus(message);
  }
  function playSample() {
    release();
    const id = generation;
    const text =
      'Let’s start with the project brief, outline the smallest useful release, and bring in a reviewer before we act.';
    $('voice-transcript').textContent = text;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setStatus('Audio playback unavailable. Read the sample above.');
      return;
    }
    sample = true;
    active = true;
    $('voice-pause').disabled = false;
    setStatus('Sample playback · browser voice');
    utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onend = () => {
      if (id === generation) stop('Sample complete. Microphone off.');
    };
    utterance.onerror = () => {
      if (id === generation) stop('Playback unavailable. Read the sample above.');
    };
    window.speechSynthesis.speak(utterance);
    timer = setTimeout(() => {
      if (id === generation) stop('Sample complete. Microphone off.');
    }, 20000);
  }
  async function start() {
    release();
    const id = generation;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Microphone unavailable in this browser. Play the sample instead.');
      return;
    }
    if (!Recognition) {
      setStatus('Speech recognition is unsupported. Play the sample instead.');
      return;
    }
    setStatus('Waiting for microphone permission…');
    $('voice-pause').disabled = false;
    try {
      const captured = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (id !== generation) {
        captured.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = captured;
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) {
        context = new Audio();
        await context.resume();
        if (id !== generation) return;
        analyser = context.createAnalyser();
        analyser.fftSize = 128;
        context.createMediaStreamSource(stream).connect(analyser);
        bins = new Uint8Array(analyser.frequencyBinCount);
      }
      recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        if (id !== generation) return;
        $('voice-transcript').textContent = Array.from(event.results)
          .map((r) => r[0].transcript)
          .join(' ');
      };
      recognition.onerror = (event) => {
        if (id === generation)
          stop(
            event.error === 'not-allowed'
              ? 'Microphone permission denied. Play the sample instead.'
              : 'Speech recognition stopped. Try again or play the sample.',
          );
      };
      recognition.onend = () => {
        if (id === generation) stop('Listening ended. Microphone off.');
      };
      recognition.start();
      active = true;
      setStatus('Listening · microphone on');
    } catch (error) {
      if (id === generation)
        stop(
          error.name === 'NotAllowedError'
            ? 'Microphone permission denied. Play the sample instead.'
            : 'Microphone unavailable. Play the sample instead.',
        );
    }
  }
  $('voice-start').addEventListener('click', start);
  $('voice-sample').addEventListener('click', playSample);
  $('voice-pause').addEventListener('click', () => stop());
  $('voice-clear').addEventListener('click', () => {
    stop('Ready when you are');
    $('voice-transcript').textContent = '“Turn this thought into a plan.”';
  });
  $('voice-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('voice-transcript').textContent);
      setStatus('Transcript copied.');
    } catch {
      setStatus('Copy unavailable. Select and copy the transcript text.');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop('Paused while this page is hidden. Microphone off.');
  });
  return {
    stop,
    get active() {
      return active;
    },
    tick(time, moving) {
      if (!active || !moving) return;
      analyser?.getByteFrequencyData(bins);
      let sum = 0;
      bars.forEach((bar, i) => {
        const energy = sample
          ? 0.15 + Math.abs(Math.sin(time * 4 + i * 0.65) * Math.sin(i * 0.21 + time)) * 0.7
          : (bins?.[i] || 0) / 255;
        sum += energy;
        bar.style.transform = `scaleY(${0.12 + energy * 0.88})`;
      });
      orb.style.transform = `scale(${1 + (sum / bars.length) * 0.055})`;
    },
  };
}
