// Sound effects (synthesized with Web Audio, no files), speech and confetti.

// ---- sounds ------------------------------------------------------------------------

let audio: AudioContext | undefined;
let soundOn = true;

export function setSoundEnabled(on: boolean): void {
  soundOn = on;
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', volume = 0.14): void {
  if (!soundOn) return;
  try {
    playTone(freq, start, duration, type, volume);
  } catch {
    // Audio unavailable (blocked or no output device): lessons work silently.
    soundOn = false;
  }
}

function playTone(freq: number, start: number, duration: number, type: OscillatorType, volume: number): void {
  audio ??= new AudioContext();
  const t = audio.currentTime + start;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export const sound = {
  correct: () => {
    tone(784, 0, 0.12);
    tone(1175, 0.09, 0.22);
  },
  wrong: () => {
    tone(196, 0, 0.22, 'triangle', 0.18);
    tone(147, 0.12, 0.3, 'triangle', 0.18);
  },
  match: () => tone(988, 0, 0.1, 'sine', 0.1),
  complete: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.28)),
};

// ---- speech ------------------------------------------------------------------------

const synth = typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis;
let voices: SpeechSynthesisVoice[] = synth?.getVoices() ?? [];
synth?.addEventListener('voiceschanged', () => (voices = synth.getVoices()));

function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const want = lang === 'zh-Hant' ? ['zh-tw', 'zh-hk'] : [lang.toLowerCase()];
  const base = lang.split('-')[0]!.toLowerCase();
  // On-device voices first; Chrome's online voices send the text to Google.
  const ordered = [...voices].sort((a, b) => Number(b.localService) - Number(a.localService));
  return (
    ordered.find((v) => want.some((w) => v.lang.toLowerCase().startsWith(w))) ??
    ordered.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === base)
  );
}

export function canSpeak(lang: string): boolean {
  return !!synth && !!voiceFor(lang);
}

export function speak(text: string, lang: string): void {
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = voiceFor(lang);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? lang;
  u.rate = 0.9;
  synth.speak(u);
}

// ---- confetti ------------------------------------------------------------------------

export function confetti(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const colors = ['#58cc02', '#1cb0f6', '#ff9600', '#ffc800', '#ce82ff', '#ff4b4b'];
  const pieces = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200,
    y: innerHeight / 3,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 4,
    size: 6 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)]!,
  }));
  const start = performance.now();
  const frame = (t: number) => {
    const elapsed = t - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pieces) {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 2800);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (elapsed < 2800) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
