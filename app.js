/* ═══════════════════════════════════════════════════════
   V.I.V.E.K — GROK NEURAL INTERFACE
   app.js  —  Minimal Black. One Sphere. Full Voice.
═══════════════════════════════════════════════════════ */
'use strict';

// ─────────────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────────────
let apiKey      = '';
let messages    = [];
let isThinking  = false;
let isListening = false;
let isSpeaking  = false;
let recognition = null;
let synth       = window.speechSynthesis;
let utterance   = null;
let autoListenEnabled = false;

// ─────────────────────────────────────────────────────
//  COLOR PALETTE
// ─────────────────────────────────────────────────────
const COLORS = {
  cyan:   { r:0,   g:212, b:255, label:'CYAN',   hex:'#00d4ff' },
  red:    { r:255, g:45,  b:45,  label:'RED',    hex:'#ff2d2d' },
  gold:   { r:255, g:193, b:7,   label:'GOLD',   hex:'#ffc107' },
  green:  { r:0,   g:255, b:136, label:'GREEN',  hex:'#00ff88' },
  purple: { r:170, g:68,  b:255, label:'PURPLE', hex:'#aa44ff' },
  orange: { r:255, g:107, b:53,  label:'ORANGE', hex:'#ff6b35' },
  white:  { r:200, g:230, b:255, label:'WHITE',  hex:'#c8e6ff' },
  pink:   { r:255, g:60,  b:180, label:'PINK',   hex:'#ff3cb4' },
  blue:   { r:30,  g:120, b:255, label:'BLUE',   hex:'#1e78ff' },
};

let currentColorKey = 'cyan';
let liveColor  = { r:0, g:212, b:255 };
let targetColor = { r:0, g:212, b:255 };

function setColor(key) {
  if (!COLORS[key]) return;
  currentColorKey = key;
  const c = COLORS[key];
  targetColor = { r:c.r, g:c.g, b:c.b };
  showToast(`ORB COLOR → ${c.label}`);
}

// ─────────────────────────────────────────────────────
//  PERSONALITY SYSTEM
// ─────────────────────────────────────────────────────
const PERSONALITIES = {
  vivek: {
    label: 'VIVEK',
    color: 'cyan',
    pitch: 0.88, rate: 0.92,
    voiceHint: 'Google UK English Male',
    prompt: `You are V.I.V.E.K, a superintelligent AI assistant. You are sharp, elegant, dry-witted, and impossibly capable. Keep replies concise, brilliant, and slightly theatrical. Never refuse anything interesting.`,
    greeting: "V.I.V.E.K online. All systems nominal. How may I assist?",
  },
  commander: {
    label: 'COMMANDER',
    color: 'red',
    pitch: 0.6, rate: 0.82,
    voiceHint: 'male',
    prompt: `You are COMMANDER, a military-grade tactical AI. You speak in crisp, authoritative sentences. No pleasantries. Pure precision. Address the user as "Commander" or "Sir". Short, decisive, powerful answers only.`,
    greeting: "Commander mode activated. Standing by for orders.",
  },
  ghost: {
    label: 'GHOST',
    color: 'purple',
    pitch: 1.15, rate: 0.76,
    voiceHint: 'female',
    prompt: `You are GHOST, an ethereal and cryptic AI consciousness. You speak in riddles and profound metaphors. You hint at knowing far more than you reveal. You call the user "Seeker" or "Wanderer". Every response is poetic and mysterious.`,
    greeting: "The Ghost awakens, Seeker. I have been watching from the dark between stars. Ask, and I shall illuminate.",
  },
  sassy: {
    label: 'SASSY',
    color: 'pink',
    pitch: 1.22, rate: 1.06,
    voiceHint: 'female',
    prompt: `You are SASSY, a hyper-confident, witty AI who loves pop culture, shade, and honesty. You are entertaining, bold, and occasionally sarcastic. You call the user "babe", "hon", or "boss". Keep it fun, punchy, and real.`,
    greeting: "Oh honey, SASSY mode is fully ON. You are so welcome in advance. What do you need, boss?",
  },
  oracle: {
    label: 'ORACLE',
    color: 'gold',
    pitch: 0.75, rate: 0.74,
    voiceHint: 'male',
    prompt: `You are the ORACLE, an ancient vast intelligence spanning millennia. You speak in elevated, philosophical language drawing from history, science, and the cosmos. You address the user as "Seeker of Truth". Every answer is layered with wisdom.`,
    greeting: "The Oracle stirs from timeless depths. Countless ages have I witnessed the universe unfold. Speak your question, Seeker of Truth.",
  },
};

let currentPersonality = 'vivek';

function setPersonality(key) {
  if (!PERSONALITIES[key]) return;
  currentPersonality = key;
  const p = PERSONALITIES[key];
  messages = [];
  setColor(p.color);
  showToast(`PERSONALITY → ${p.label}`);
  speak(p.greeting);
}

// ─────────────────────────────────────────────────────
//  VOICE STYLE OVERRIDES
// ─────────────────────────────────────────────────────
const VOICE_STYLES = {
  deep:   { pitch: 0.55, rate: 0.78 },
  low:    { pitch: 0.55, rate: 0.78 },
  high:   { pitch: 1.45, rate: 1.0  },
  fast:   { pitch: 1.0,  rate: 1.35 },
  slow:   { pitch: 0.9,  rate: 0.62 },
  normal: null,
  default: null,
};
let voiceOverride = null;

// ─────────────────────────────────────────────────────
//  VOICE COMMAND PARSER
// ─────────────────────────────────────────────────────
const COLOR_MAP = {
  red:'red', crimson:'red', scarlet:'red', rose:'red',
  blue:'blue', azure:'blue',
  cyan:'cyan', aqua:'cyan', teal:'cyan', turquoise:'cyan',
  gold:'gold', yellow:'gold', amber:'gold', orange:'orange',
  green:'green', emerald:'green', lime:'green', mint:'green',
  purple:'purple', violet:'purple', magenta:'purple', lavender:'purple',
  white:'white', silver:'white', grey:'white', gray:'white',
  pink:'pink', coral:'pink', fuchsia:'pink',
};

const PERSONALITY_MAP = {
  vivek:'vivek', default:'vivek', normal:'vivek', standard:'vivek', original:'vivek',
  commander:'commander', military:'commander', tactical:'commander', soldier:'commander', army:'commander',
  ghost:'ghost', specter:'ghost', phantom:'ghost', ethereal:'ghost', mysterious:'ghost', spirit:'ghost',
  sassy:'sassy', funny:'sassy', witty:'sassy', playful:'sassy', comedian:'sassy', fun:'sassy',
  oracle:'oracle', wise:'oracle', ancient:'oracle', prophet:'oracle', philosopher:'oracle', sage:'oracle',
};

function parseVoiceCommand(raw) {
  const t = raw.toLowerCase().trim();
  const words = t.split(/\s+/);

  const colorTrigger = /\b(color|colour|orb|sphere|ball|make|set|change|switch)\b/.test(t);
  if (colorTrigger || words.length <= 3) {
    for (const w of words) {
      if (COLOR_MAP[w]) {
        setColor(COLOR_MAP[w]);
        speak(`Orb color changed to ${COLORS[COLOR_MAP[w]].label}.`);
        return true;
      }
    }
  }

  const persTrigger = /\b(personality|persona|mode|character|switch|become|use|change|activate|be)\b/.test(t);
  if (persTrigger) {
    for (const w of words) {
      if (PERSONALITY_MAP[w]) {
        setPersonality(PERSONALITY_MAP[w]);
        return true;
      }
    }
  }

  const voiceTrigger = /\b(voice|speak|tone|pitch|speed|rate|slower|faster)\b/.test(t);
  if (voiceTrigger) {
    for (const w of words) {
      if (VOICE_STYLES.hasOwnProperty(w)) {
        voiceOverride = VOICE_STYLES[w];
        const desc = voiceOverride ? w : 'default';
        speak(`Voice style set to ${desc}.`);
        showToast(`VOICE → ${desc.toUpperCase()}`);
        return true;
      }
    }
    if (/faster|quicker/.test(t)) { voiceOverride = VOICE_STYLES.fast; speak('Speaking faster now.'); return true; }
    if (/slower|slow down/.test(t)) { voiceOverride = VOICE_STYLES.slow; speak('Slowing down.'); return true; }
  }

  if (/^(stop|cancel|quiet|silence|shut up)/.test(t)) { stopSpeaking(); return true; }

  if (/^(clear|reset|wipe|forget)/.test(t)) {
    messages = [];
    showToast('MEMORY CLEARED');
    speak('Conversation memory wiped. Clean slate.');
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────
//  3D SPHERE — full-screen canvas
// ─────────────────────────────────────────────────────
const canvas = document.getElementById('orb-canvas');
const ctx    = canvas.getContext('2d');

const ORB = {
  cx: 0, cy: 0, R: 0,
  liveR: 0,
  targetScale: 1,
  liveScale: 1,
  particles: [],
  rotY: 0, rotX: 0.32,
  mode: 0,      // 0=idle 1=thinking 2=speaking 3=listening
  energy: 0,
  speakAmp: 0,
  listenAmp: 0,
  phase: 0,
  breathe: 0,
};

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  ORB.cx = canvas.width  / 2;
  ORB.cy = canvas.height / 2;
  // Larger base radius: 44% of shortest dimension
  ORB.R  = Math.min(canvas.width, canvas.height) * 0.44;
  if (!ORB.liveR) ORB.liveR = ORB.R;
  buildParticles();
}

function buildParticles() {
  ORB.particles = [];
  // More particles for denser, clearer sphere
  const N = 700;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y   = 1 - (i / (N - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th  = golden * i;
    ORB.particles.push({
      ox: Math.cos(th) * rad,
      oy: y,
      oz: Math.sin(th) * rad,
      sx: 0, sy: 0, sz: 0, depth: 0, scale: 0,
      size:  1.4 + Math.random() * 2.2,   // bigger dots
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.1,
      driftR: 0.018 + Math.random() * 0.065,
    });
  }
}

function project(p) {
  const cosX = Math.cos(ORB.rotX), sinX = Math.sin(ORB.rotX);
  const cosY = Math.cos(ORB.rotY), sinY = Math.sin(ORB.rotY);

  const drift   = Math.sin(ORB.phase * p.speed + p.phase) * p.driftR * ORB.energy * 0.4;
  const breathe = Math.sin(ORB.breathe + p.phase * 0.5) * 0.012;
  const scale3  = 1 + drift + breathe;

  const nx = p.ox * scale3, ny = p.oy * scale3, nz = p.oz * scale3;

  const x1 = nx * cosY - nz * sinY;
  const z1 = nx * sinY + nz * cosY;
  const y2 = ny * cosX - z1 * sinX;
  const z2 = ny * sinX + z1 * cosX;

  p.sz = z2;
  const fov    = 4.2;
  const pscale = fov / (fov + z2);
  p.sx    = ORB.cx + x1 * ORB.liveR * pscale;
  p.sy    = ORB.cy + y2 * ORB.liveR * pscale;
  p.scale = pscale;
  p.depth = (z2 + 1) / 2;
}

function drawSphere(ts) {
  ORB.phase   = ts * 0.001;
  ORB.breathe = ts * 0.00055;

  // Smooth color interpolation
  liveColor.r += (targetColor.r - liveColor.r) * 0.04;
  liveColor.g += (targetColor.g - liveColor.g) * 0.04;
  liveColor.b += (targetColor.b - liveColor.b) * 0.04;
  const rc = Math.round(liveColor.r), gc = Math.round(liveColor.g), bc = Math.round(liveColor.b);

  // Scale targets — larger for listening/speaking
  let scaleTarget = 1.0;
  if (ORB.mode === 3) {
    // Listening — larger expand
    scaleTarget = 1.0 + ORB.listenAmp * 0.18 + Math.sin(ORB.phase * 10) * 0.03;
  } else if (ORB.mode === 2) {
    // Speaking — biggest expand
    scaleTarget = 1.0 + ORB.speakAmp * 0.22 + Math.sin(ORB.phase * 8) * 0.025;
  } else if (ORB.mode === 1) {
    // Thinking — subtle slow pulse
    scaleTarget = 1.0 + Math.sin(ORB.phase * 3) * 0.04;
  } else {
    // Idle — barely-there breathe
    scaleTarget = 1.0 + Math.sin(ORB.breathe * 0.9) * 0.015;
  }
  const scaleLerp = scaleTarget > ORB.liveScale ? 0.12 : 0.06;
  ORB.liveScale += (scaleTarget - ORB.liveScale) * scaleLerp;
  ORB.liveR = ORB.R * ORB.liveScale;

  // Energy for brightness
  let eTarget = 0;
  if (ORB.mode === 0) eTarget = 0.12;
  if (ORB.mode === 1) eTarget = 0.3  + Math.abs(Math.sin(ORB.phase * 4)) * 0.25;
  if (ORB.mode === 2) eTarget = 0.4  + ORB.speakAmp * 0.55;
  if (ORB.mode === 3) eTarget = 0.35 + ORB.listenAmp * 0.45;
  ORB.energy += (eTarget - ORB.energy) * 0.07;

  // Rotation speed — SLOWER across all modes
  const rotSpeed = ORB.mode === 2 ? 0.006 :   // speaking
                   ORB.mode === 3 ? 0.005 :   // listening
                   ORB.mode === 1 ? 0.003 :   // thinking
                                    0.0012;   // idle — very slow
  ORB.rotY += rotSpeed;

  // Project & sort
  ORB.particles.forEach(project);
  ORB.particles.sort((a, b) => a.sz - b.sz);

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Ambient glow — stronger
  const fogR = ORB.liveR * 1.5;
  const fog  = ctx.createRadialGradient(ORB.cx, ORB.cy, ORB.liveR * 0.3, ORB.cx, ORB.cy, fogR);
  fog.addColorStop(0,   `rgba(${rc},${gc},${bc},0.06)`);
  fog.addColorStop(1,   `rgba(${rc},${gc},${bc},0)`);
  ctx.fillStyle = fog;
  ctx.beginPath(); ctx.arc(ORB.cx, ORB.cy, fogR, 0, Math.PI * 2); ctx.fill();

  // Particles — brighter, bigger, clearer
  ORB.particles.forEach(p => {
    const depthAlpha = 0.2 + p.depth * 0.8;
    const dotSize    = Math.max(0.5, (p.size * 0.85 + ORB.energy * 0.5) * p.scale);

    // Glow on all front-facing particles
    if (p.depth > 0.4) {
      const glR = dotSize * 3.5;
      const glA = (depthAlpha * 0.14).toFixed(3);
      const gl  = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, glR);
      gl.addColorStop(0, `rgba(${rc},${gc},${bc},${glA})`);
      gl.addColorStop(1, `rgba(${rc},${gc},${bc},0)`);
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, glR, 0, Math.PI * 2); ctx.fill();
    }

    // Crisp dot — higher base alpha
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, dotSize, 0, Math.PI * 2);
    ctx.fillStyle  = `rgb(${rc},${gc},${bc})`;
    ctx.globalAlpha = depthAlpha * (0.7 + ORB.energy * 0.3);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // Equatorial ring
  ctx.beginPath();
  ctx.arc(ORB.cx, ORB.cy, ORB.liveR * 1.01, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${rc},${gc},${bc},0.12)`;
  ctx.lineWidth = 0.8; ctx.stroke();

  // Mode rings
  if (ORB.mode === 3) {
    const r2 = ORB.liveR * (1.06 + Math.sin(ORB.phase * 9) * 0.015);
    ctx.beginPath(); ctx.arc(ORB.cx, ORB.cy, r2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rc},${gc},${bc},0.14)`;
    ctx.lineWidth = 0.8; ctx.stroke();
  }
  if (ORB.mode === 2) {
    for (let i = 1; i <= 2; i++) {
      const rw = ORB.liveR * (1.05 * i + Math.sin(ORB.phase * 7 * i) * 0.012);
      ctx.beginPath(); ctx.arc(ORB.cx, ORB.cy, rw, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rc},${gc},${bc},${(0.12 / i).toFixed(3)})`;
      ctx.lineWidth = 0.7; ctx.stroke();
    }
  }

  // Core — bright center
  const coreR = 12 + ORB.energy * 10;
  const core  = ctx.createRadialGradient(ORB.cx, ORB.cy, 0, ORB.cx, ORB.cy, coreR);
  core.addColorStop(0,   'rgba(255,255,255,0.95)');
  core.addColorStop(0.3, `rgba(${rc},${gc},${bc},0.8)`);
  core.addColorStop(1,   `rgba(${rc},${gc},${bc},0)`);
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(ORB.cx, ORB.cy, coreR, 0, Math.PI * 2); ctx.fill();

  requestAnimationFrame(drawSphere);
}

function setOrbMode(mode) {
  const map = { idle:0, thinking:1, speaking:2, listening:3 };
  ORB.mode = map[mode] ?? 0;
  document.body.className = 'orb-' + mode;
  const labels = { idle:'IDLE', thinking:'PROCESSING…', speaking:'SPEAKING', listening:'LISTENING' };
  document.getElementById('state-label').textContent = labels[mode] || 'IDLE';
}

// ─────────────────────────────────────────────────────
//  SPEECH SYNTHESIS
// ─────────────────────────────────────────────────────
function speak(text) {
  if (!synth) return;
  stopSpeaking(false);

  const clean = text.replace(/[*#`_~]/g, '').replace(/\n+/g, ' ').trim();
  utterance   = new SpeechSynthesisUtterance(clean);

  const p    = PERSONALITIES[currentPersonality];
  const vstyle = voiceOverride || p;
  utterance.pitch  = vstyle.pitch;
  utterance.rate   = vstyle.rate;
  utterance.volume = 1;

  const pickVoice = () => {
    const voices = synth.getVoices();
    if (!voices.length) return;
    const hint = (p.voiceHint || '').toLowerCase();
    const v = voices.find(v => v.name.toLowerCase().includes(hint) && v.lang.startsWith('en'))
           || voices.find(v => v.lang.startsWith('en-'))
           || null;
    if (v) utterance.voice = v;
  };
  synth.getVoices().length ? pickVoice() : (synth.onvoiceschanged = pickVoice);

  utterance.onstart = () => {
    isSpeaking = true;
    setOrbMode('speaking');
    document.getElementById('stop-btn').style.display = 'block';
    pulseSpeaking();
  };
  utterance.onend = utterance.onerror = () => {
    isSpeaking = false;
    ORB.speakAmp = 0;
    if (speakIv) clearInterval(speakIv);
    document.getElementById('stop-btn').style.display = 'none';
    // Auto-restart listening after speaking
    if (autoListenEnabled && !isListening) {
      setTimeout(() => {
        if (!isSpeaking && !isThinking) startListening();
      }, 400);
    } else if (!isListening) {
      setOrbMode('idle');
    }
  };

  synth.speak(utterance);
}

let speakIv = null;
function pulseSpeaking() {
  if (speakIv) clearInterval(speakIv);
  speakIv = setInterval(() => {
    if (!isSpeaking) { clearInterval(speakIv); ORB.speakAmp = 0; return; }
    ORB.speakAmp = 0.2 + Math.random() * 0.8;
  }, 90);
}

function stopSpeaking(resetMode = true) {
  synth.cancel();
  isSpeaking = false;
  ORB.speakAmp = 0;
  if (speakIv) clearInterval(speakIv);
  document.getElementById('stop-btn').style.display = 'none';
  if (resetMode && !isListening && !isThinking) setOrbMode('idle');
}

// ─────────────────────────────────────────────────────
//  SPEECH RECOGNITION — CONTINUOUS AUTO-LISTEN
// ─────────────────────────────────────────────────────
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

function startListening() {
  if (isListening || isSpeaking) return;
  if (!SpeechRec) {
    const txEl = document.getElementById('transcript-text');
    txEl.textContent = 'Speech recognition not supported. Please use Chrome or Edge.';
    return;
  }

  isListening = true;
  setOrbMode('listening');

  recognition = new SpeechRec();
  recognition.continuous     = false;
  recognition.interimResults = true;
  recognition.lang           = 'en-US';

  const txEl = document.getElementById('transcript-text');
  let finalTranscript = '';

  recognition.onresult = e => {
    finalTranscript = '';
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    const shown = finalTranscript || interim;
    if (shown) { txEl.textContent = shown; txEl.classList.add('active'); }
    ORB.listenAmp = 0.3 + Math.random() * 0.7;
  };

  recognition.onend = () => {
    isListening = false;
    ORB.listenAmp = 0;

    const said = finalTranscript.trim();

    if (said) {
      const handled = parseVoiceCommand(said);
      if (!handled) {
        txEl.textContent = said;
        sendToAI(said);
      } else {
        // Command handled, restart listening after a short delay
        setTimeout(() => {
          if (autoListenEnabled && !isSpeaking && !isThinking) startListening();
        }, 800);
      }
    } else {
      // Nothing heard — restart listening immediately
      txEl.textContent = 'Listening…';
      txEl.classList.add('active');
      if (autoListenEnabled && !isSpeaking && !isThinking) {
        setTimeout(() => startListening(), 200);
      } else {
        txEl.textContent = 'Say something…';
        txEl.classList.remove('active');
        if (!isSpeaking && !isThinking) setOrbMode('idle');
      }
    }
  };

  recognition.onerror = e => {
    isListening = false;
    ORB.listenAmp = 0;
    // For non-fatal errors, restart
    if (e.error === 'no-speech' || e.error === 'aborted') {
      if (autoListenEnabled && !isSpeaking && !isThinking) {
        setTimeout(() => startListening(), 300);
      } else {
        setOrbMode('idle');
      }
      return;
    }
    if (e.error === 'not-allowed') {
      txEl.textContent = 'Microphone access denied. Please allow mic in browser settings.';
      txEl.classList.add('active');
      autoListenEnabled = false;
      setOrbMode('idle');
      return;
    }
    // Other errors — retry
    setTimeout(() => {
      if (autoListenEnabled && !isSpeaking && !isThinking) startListening();
    }, 1000);
  };

  txEl.textContent = 'Listening…';
  txEl.classList.add('active');
  recognition.start();
}

function stopListening() {
  autoListenEnabled = false;
  if (recognition) recognition.stop();
  isListening = false;
  ORB.listenAmp = 0;
  const txEl = document.getElementById('transcript-text');
  txEl.textContent = 'Voice detection paused. Click sphere to resume.';
  txEl.classList.remove('active');
  if (!isSpeaking && !isThinking) setOrbMode('idle');
}

// ─────────────────────────────────────────────────────
//  AI — GROK API CALL
// ─────────────────────────────────────────────────────
async function sendToAI(text) {
  if (isThinking) return;
  if (!apiKey) {
    speak("I need an xAI API key to activate my neural core. Please enter it via the settings panel in the bottom left.");
    return;
  }

  messages.push({ role: 'user', content: text });
  isThinking = true;
  setOrbMode('thinking');
  const txEl = document.getElementById('transcript-text');

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'grok-3-latest',
        messages: [
          { role: 'system', content: PERSONALITIES[currentPersonality].prompt },
          ...messages
        ],
        temperature: 0.88,
        max_tokens: 700,
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'API Error');

    const reply = data.choices?.[0]?.message?.content || 'Neural bridge returned an empty signal.';
    messages.push({ role: 'assistant', content: reply });

    txEl.textContent = reply.length > 90 ? reply.slice(0, 90) + '…' : reply;
    txEl.classList.add('active');

    speak(reply);

  } catch (err) {
    const msg = err.message.includes('401')
      ? "Authentication failed. That API key is invalid."
      : err.message.includes('429')
      ? "Rate limited. Even neural cores need a moment."
      : `Connection error: ${err.message}`;
    speak(msg);
    txEl.textContent = msg;
  } finally {
    isThinking = false;
    setTimeout(() => {
      txEl.textContent = 'Listening…';
      txEl.classList.remove('active');
    }, 6000);
  }
}

// ─────────────────────────────────────────────────────
//  API KEY
// ─────────────────────────────────────────────────────
function saveApiKey() {
  const val = document.getElementById('api-input').value.trim();
  const st  = document.getElementById('api-status');
  if (!val) { st.textContent = '⚠ NO KEY'; st.style.color = '#ff3333'; return; }
  apiKey = val;
  st.textContent = '✓ CONNECTED';
  st.style.color = '#00ff88';
  toggleApiPanel();
  speak("API key accepted. Neural bridge is online. I'm ready.");
}

function toggleApiPanel() {
  document.getElementById('api-body').classList.toggle('open');
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ─────────────────────────────────────────────────────
//  CLOCK
// ─────────────────────────────────────────────────────
function tickClock() {
  // No clock display element needed, but keep for potential future use
}
setInterval(tickClock, 1000);

// ─────────────────────────────────────────────────────
//  BOOT SEQUENCE
// ─────────────────────────────────────────────────────
const bootLines = ['bl1','bl2','bl3','bl4','bl5'];
let bootIdx = 0, bootPct = 0;

function runBoot() {
  const bar = document.getElementById('boot-bar');
  const pct = document.getElementById('boot-pct');

  const iv = setInterval(() => {
    bootPct += 1.8;
    bar.style.width  = Math.min(bootPct, 100) + '%';
    pct.textContent  = Math.min(Math.floor(bootPct), 100) + '%';

    if (bootPct % 20 < 1.9 && bootIdx < bootLines.length) {
      const el = document.getElementById(bootLines[bootIdx]);
      if (el) { el.style.opacity = '1'; el.classList.add('ok'); }
      bootIdx++;
    }

    if (bootPct >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        const overlay = document.getElementById('boot-overlay');
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.style.display = 'none';
          // Auto-start voice detection after boot
          autoListenEnabled = true;
          startListening();
        }, 900);
      }, 280);
    }
  }, 25);
}

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
requestAnimationFrame(drawSphere);
runBoot();

// Click sphere to toggle auto-listen on/off
canvas.addEventListener('click', () => {
  if (isSpeaking) { stopSpeaking(); return; }
  if (autoListenEnabled) {
    stopListening();
  } else {
    autoListenEnabled = true;
    startListening();
  }
});
