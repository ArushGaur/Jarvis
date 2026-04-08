/* ═══════════════════════════════════════════════════════
   V.I.V.E.K — GEMINI LIVE NEURAL INTERFACE
   app.js  — Iron Man Holographic Sphere + Turso Backend
═══════════════════════════════════════════════════════ */
'use strict';

// ─────────────────────────────────────────────────────
//  BACKEND CONFIG  — set your Render backend URL here
// ─────────────────────────────────────────────────────
const BACKEND_URL = 'https://vivek-backend.onrender.com'; // ← Replace with your Render URL

// ─────────────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────────────
let apiKey       = '';       // Fetched from backend /api/config
let messages     = [];
let isThinking   = false;
let isListening  = false;
let isSpeaking   = false;
let isDormant    = true;
let currentSessionId = null;

// Gemini Live WebSocket
let liveWs       = null;
let sessionReady = false;
let nextPlayTime = 0;

// AudioContext for mic capture + playback
let audioCtx     = null;
let micStream    = null;
let scriptProc   = null;
let micSrcNode   = null;
let nativeSR     = 48000;

// Wake word detection (Web Speech API)
let wakeRec      = null;
let wakeRunning  = false;
let wakeRestartTimer = null;

// Fallback TTS
let synth        = window.speechSynthesis;
let utterance    = null;
let speakIv      = null;

const SpeechRec  = window.SpeechRecognition || window.webkitSpeechRecognition;

// ─────────────────────────────────────────────────────
//  COLOR PALETTE
// ─────────────────────────────────────────────────────
const COLORS = {
  orange: { r:255, g:154, b:0,   label:'ORANGE', hex:'#ff9a00' },
  cyan:   { r:0,   g:212, b:255, label:'CYAN',   hex:'#00d4ff' },
  red:    { r:255, g:45,  b:45,  label:'RED',    hex:'#ff2d2d' },
  gold:   { r:255, g:193, b:7,   label:'GOLD',   hex:'#ffc107' },
  green:  { r:0,   g:255, b:136, label:'GREEN',  hex:'#00ff88' },
  purple: { r:170, g:68,  b:255, label:'PURPLE', hex:'#aa44ff' },
  white:  { r:200, g:230, b:255, label:'WHITE',  hex:'#c8e6ff' },
  pink:   { r:255, g:60,  b:180, label:'PINK',   hex:'#ff3cb4' },
  blue:   { r:30,  g:120, b:255, label:'BLUE',   hex:'#1e78ff' },
};

let currentColorKey = 'orange';
let liveColor  = { r:255, g:154, b:0 };
let targetColor = { r:255, g:154, b:0 };

function setColor(key) {
  if (!COLORS[key]) return;
  currentColorKey = key;
  const c = COLORS[key];
  targetColor = { r:c.r, g:c.g, b:c.b };
  showToast('ORB COLOR — ' + c.label);
}

// ─────────────────────────────────────────────────────
//  PERSONALITIES
// ─────────────────────────────────────────────────────
const PERSONALITIES = {
  vivek: {
    label: 'VIVEK',
    color: 'orange',
    geminiVoice: 'Charon',
    prompt: 'You are V.I.V.E.K, a superintelligent AI assistant. You are sharp, elegant, dry-witted, and impossibly capable. Keep replies concise, brilliant, and slightly theatrical. Never refuse anything interesting.',
    greeting: "V.I.V.E.K online. All systems nominal. How may I assist?",
  },
  commander: {
    label: 'COMMANDER',
    color: 'red',
    geminiVoice: 'Fenrir',
    prompt: 'You are COMMANDER, a military-grade tactical AI. Crisp, authoritative sentences. No pleasantries. Address the user as Commander or Sir. Short, decisive answers only.',
    greeting: "Commander mode activated. Standing by for orders.",
  },
  ghost: {
    label: 'GHOST',
    color: 'purple',
    geminiVoice: 'Kore',
    prompt: 'You are GHOST, an ethereal cryptic AI. Speak in riddles and profound metaphors. Call the user Seeker or Wanderer. Every response is poetic and mysterious.',
    greeting: "The Ghost awakens, Seeker. I have been watching from the dark between stars.",
  },
  sassy: {
    label: 'SASSY',
    color: 'pink',
    geminiVoice: 'Aoede',
    prompt: 'You are SASSY, a hyper-confident witty AI. Bold, entertaining, occasionally sarcastic. Call the user babe, hon, or boss. Keep it fun and punchy.',
    greeting: "Oh honey, SASSY mode is fully ON. What do you need, boss?",
  },
  oracle: {
    label: 'ORACLE',
    color: 'gold',
    geminiVoice: 'Puck',
    prompt: 'You are the ORACLE, an ancient vast intelligence. Speak in elevated philosophical language drawing from history and the cosmos. Address the user as Seeker of Truth.',
    greeting: "The Oracle stirs from timeless depths. Speak your question, Seeker of Truth.",
  },
};

let currentPersonality = 'vivek';

function setPersonality(key) {
  if (!PERSONALITIES[key]) return;
  currentPersonality = key;
  const p = PERSONALITIES[key];
  messages = [];
  setColor(p.color);
  showToast('PERSONALITY — ' + p.label);
  speakSystem(p.greeting);
}

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
  commander:'commander', military:'commander', tactical:'commander',
  ghost:'ghost', specter:'ghost', phantom:'ghost', ethereal:'ghost',
  sassy:'sassy', funny:'sassy', witty:'sassy', playful:'sassy',
  oracle:'oracle', wise:'oracle', ancient:'oracle', prophet:'oracle',
};

function parseVoiceCommand(raw) {
  const t = raw.toLowerCase().trim();
  const words = t.split(/\s+/);

  const colorTrigger = /\b(color|colour|orb|sphere|ball|make|set|change|switch)\b/.test(t);
  if (colorTrigger || words.length <= 3) {
    for (const w of words) {
      if (COLOR_MAP[w]) { setColor(COLOR_MAP[w]); speakSystem('Orb color changed to ' + COLORS[COLOR_MAP[w]].label + '.'); return true; }
    }
  }

  const persTrigger = /\b(personality|persona|mode|character|switch|become|use|change|activate|be)\b/.test(t);
  if (persTrigger) {
    for (const w of words) {
      if (PERSONALITY_MAP[w]) { setPersonality(PERSONALITY_MAP[w]); return true; }
    }
  }

  if (/^(stop|cancel|quiet|silence|shut up)/.test(t)) { stopAll(); return true; }

  if (/^(clear|reset|wipe|forget)/.test(t)) {
    messages = [];
    showToast('MEMORY CLEARED');
    speakSystem('Conversation memory wiped. Clean slate.');
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────
//  IRON MAN HOLOGRAPHIC SPHERE — Canvas Renderer
// ─────────────────────────────────────────────────────
const canvas = document.getElementById('orb-canvas');
const ctx    = canvas.getContext('2d');

const ORB = {
  cx: 0, cy: 0, R: 0,
  liveR: 0,
  liveScale: 1,
  rotY: 0, rotX: 0.32,
  mode: 0,
  energy: 0,
  speakAmp: 0,
  listenAmp: 0,
  phase: 0,
  breathe: 0,
  // Holographic grid lines
  rings: [],
  meridians: [],
  // Circuit-like surface arcs
  circuits: [],
  // Orbital rings (like Iron Man globe)
  orbitals: [],
  // Floating data nodes
  nodes: [],
};

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  ORB.cx = canvas.width  / 2;
  ORB.cy = canvas.height / 2;
  ORB.R  = Math.min(canvas.width, canvas.height) * 0.33;
  if (!ORB.liveR) ORB.liveR = ORB.R;
  buildHoloSphere();
}

function buildHoloSphere() {
  // Latitude rings on sphere surface
  ORB.rings = [];
  const ringCount = 10;
  for (let i = 0; i < ringCount; i++) {
    const lat = -Math.PI/2 + (Math.PI * i / (ringCount - 1));
    const r   = Math.cos(lat);
    ORB.rings.push({ lat, r, y: Math.sin(lat), opacity: 0.15 + Math.random() * 0.25 });
  }

  // Longitude meridians
  ORB.meridians = [];
  const meridCount = 12;
  for (let i = 0; i < meridCount; i++) {
    const lon = (Math.PI * 2 * i) / meridCount;
    ORB.meridians.push({ lon, opacity: 0.12 + Math.random() * 0.18 });
  }

  // Circuit-like arcs on sphere surface (Iron Man map-like details)
  ORB.circuits = [];
  for (let i = 0; i < 28; i++) {
    const lat    = (Math.random() - 0.5) * Math.PI;
    const lon    = Math.random() * Math.PI * 2;
    const arc    = 0.15 + Math.random() * 0.55;
    const width  = 0.5 + Math.random() * 1.0;
    const pulse  = Math.random() * Math.PI * 2;
    ORB.circuits.push({ lat, lon, arc, width, pulse, speed: 0.3 + Math.random() * 1.2 });
  }

  // Orbital rings that fly around the sphere (the distinctive Iron Man globe rings)
  ORB.orbitals = [];
  const orbConfigs = [
    { tilt: 0,          speed: 0.006, radiusScale: 1.15, opacity: 0.55, dashes: [18, 6] },
    { tilt: Math.PI/3,  speed: -0.009, radiusScale: 1.22, opacity: 0.35, dashes: [8, 10] },
    { tilt: Math.PI/5,  speed: 0.013,  radiusScale: 1.28, opacity: 0.25, dashes: [4, 16] },
    { tilt: -Math.PI/4, speed: -0.007, radiusScale: 1.18, opacity: 0.40, dashes: [12, 8] },
  ];
  for (const cfg of orbConfigs) {
    ORB.orbitals.push({ ...cfg, angle: Math.random() * Math.PI * 2 });
  }

  // Floating nodes (bright spots on rings)
  ORB.nodes = [];
  for (let i = 0; i < 8; i++) {
    ORB.nodes.push({
      orbitalIdx: i % orbConfigs.length,
      offset: Math.random() * Math.PI * 2,
      size: 2.5 + Math.random() * 3.5,
      pulse: Math.random() * Math.PI * 2,
    });
  }
}

// Project 3D sphere-surface point to 2D canvas
function project3D(lat, lon, rotY, rotX, radius) {
  const x0 = Math.cos(lat) * Math.cos(lon);
  const y0 = Math.sin(lat);
  const z0 = Math.cos(lat) * Math.sin(lon);

  // Rotate Y
  const x1 = x0 * Math.cos(rotY) - z0 * Math.sin(rotY);
  const z1 = x0 * Math.sin(rotY) + z0 * Math.cos(rotY);
  // Rotate X
  const y2 = y0 * Math.cos(rotX) - z1 * Math.sin(rotX);
  const z2 = y0 * Math.sin(rotX) + z1 * Math.cos(rotX);

  const fov   = 4.5;
  const scale = fov / (fov + z2);
  return {
    x:     ORB.cx + x1 * radius * scale,
    y:     ORB.cy + y2 * radius * scale,
    depth: (z2 + 1) / 2,
    scale,
  };
}

// Draw a great circle arc on the sphere surface
function drawSphereArc(lat, lon, arcLen, rotY, rotX, radius, color, lineWidth, alpha) {
  const steps = 32;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= steps; i++) {
    const t   = i / steps;
    const pLon = lon + arcLen * (t - 0.5);
    const pt  = project3D(lat, pLon, rotY, rotX, radius);
    if (pt.depth < 0.02) { started = false; continue; }
    if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth   = lineWidth;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHoloSphere(ts) {
  ORB.phase   = ts * 0.001;
  ORB.breathe = ts * 0.00055;

  // Smooth color transition
  liveColor.r += (targetColor.r - liveColor.r) * 0.05;
  liveColor.g += (targetColor.g - liveColor.g) * 0.05;
  liveColor.b += (targetColor.b - liveColor.b) * 0.05;
  const rc = Math.round(liveColor.r);
  const gc = Math.round(liveColor.g);
  const bc = Math.round(liveColor.b);
  const col = `${rc},${gc},${bc}`;

  // Scale based on mode
  let scaleTarget = 1.0;
  if      (ORB.mode === 3) scaleTarget = 1.0 + ORB.listenAmp * 0.12 + Math.sin(ORB.phase * 10) * 0.02;
  else if (ORB.mode === 2) scaleTarget = 1.0 + ORB.speakAmp  * 0.16 + Math.sin(ORB.phase *  8) * 0.018;
  else if (ORB.mode === 1) scaleTarget = 1.0 + Math.sin(ORB.phase * 3) * 0.03;
  else                     scaleTarget = 1.0 + Math.sin(ORB.breathe * 0.9) * 0.012;

  ORB.liveScale += (scaleTarget - ORB.liveScale) * (scaleTarget > ORB.liveScale ? 0.1 : 0.05);
  ORB.liveR = ORB.R * ORB.liveScale;

  // Energy level
  let eTarget = 0;
  if (ORB.mode === 0) eTarget = 0.10;
  if (ORB.mode === 1) eTarget = 0.30 + Math.abs(Math.sin(ORB.phase * 4)) * 0.2;
  if (ORB.mode === 2) eTarget = 0.45 + ORB.speakAmp * 0.5;
  if (ORB.mode === 3) eTarget = 0.35 + ORB.listenAmp * 0.4;
  ORB.energy += (eTarget - ORB.energy) * 0.07;

  // Rotation speed
  const rotSpeed = ORB.mode === 2 ? 0.007 : ORB.mode === 3 ? 0.006 : ORB.mode === 1 ? 0.004 : 0.0015;
  ORB.rotY += rotSpeed;

  // Update orbital angles
  for (const orb of ORB.orbitals) {
    orb.angle += orb.speed * (1 + ORB.energy * 0.5);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const R  = ORB.liveR;
  const cx = ORB.cx, cy = ORB.cy;
  const rY = ORB.rotY, rX = ORB.rotX;

  // ── 1. Ambient glow ───────────────────────────────
  const glowR = R * 1.8;
  const glow  = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, glowR);
  glow.addColorStop(0, `rgba(${col},${(0.08 + ORB.energy * 0.06).toFixed(3)})`);
  glow.addColorStop(0.5, `rgba(${col},${(0.03 + ORB.energy * 0.02).toFixed(3)})`);
  glow.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill();

  // ── 2. Sphere inner light (volumetric look) ───────
  const innerGlow = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.2, 0, cx, cy, R);
  innerGlow.addColorStop(0,   `rgba(${col},${(0.06 + ORB.energy * 0.05).toFixed(3)})`);
  innerGlow.addColorStop(0.6, `rgba(${col},${(0.02 + ORB.energy * 0.02).toFixed(3)})`);
  innerGlow.addColorStop(1,   `rgba(${col},0)`);
  ctx.fillStyle = innerGlow;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  // ── 3. Latitude rings on sphere ───────────────────
  const ringBaseAlpha = 0.08 + ORB.energy * 0.12;
  for (const ring of ORB.rings) {
    const steps = 80;
    let started = false;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const lon = (i / steps) * Math.PI * 2;
      const pt  = project3D(ring.lat, lon, rY, rX, R);
      if (pt.depth < 0.05) { started = false; continue; }
      if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = `rgb(${col})`;
    ctx.globalAlpha = ringBaseAlpha * ring.opacity * 4;
    ctx.lineWidth   = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── 4. Meridian lines ─────────────────────────────
  const meridAlpha = 0.06 + ORB.energy * 0.08;
  for (const merid of ORB.meridians) {
    const steps = 60;
    let started = false;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const lat = -Math.PI/2 + Math.PI * (i / steps);
      const pt  = project3D(lat, merid.lon + rY, 0, rX, R);
      if (pt.depth < 0.05) { started = false; continue; }
      if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = `rgb(${col})`;
    ctx.globalAlpha = meridAlpha * merid.opacity * 4;
    ctx.lineWidth   = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── 5. Circuit arcs (Iron Man map details) ────────
  for (const c of ORB.circuits) {
    const pulseAlpha = 0.04 + ORB.energy * 0.14 + Math.sin(ORB.phase * c.speed + c.pulse) * 0.06;
    drawSphereArc(c.lat, c.lon + rY, c.arc, 0, rX, R,
      `rgb(${col})`, c.width * (0.6 + ORB.energy * 0.4), pulseAlpha);
  }

  // ── 6. Sphere wireframe edge ──────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${(0.18 + ORB.energy * 0.2).toFixed(3)})`;
  ctx.lineWidth   = 1.0; ctx.stroke();

  // Bright equator highlight
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${(0.08 + ORB.energy * 0.08).toFixed(3)})`;
  ctx.lineWidth   = 3.0; ctx.stroke();

  // ── 7. Orbital rings (the key Iron Man globe effect) ──
  for (let oi = 0; oi < ORB.orbitals.length; oi++) {
    const orb = ORB.orbitals[oi];
    const oR  = R * orb.radiusScale;

    // Transform: tilt the ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(orb.angle * 0.3);
    ctx.scale(1, Math.sin(orb.tilt + ORB.phase * 0.2) * 0.4 + 0.6);

    const orbAlpha = orb.opacity * (0.5 + ORB.energy * 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, oR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${col},${orbAlpha.toFixed(3)})`;
    ctx.lineWidth   = 1.2 + ORB.energy * 0.8;
    if (orb.dashes) ctx.setLineDash(orb.dashes);
    ctx.stroke();
    ctx.setLineDash([]);

    // Glow on orbital
    ctx.beginPath();
    ctx.arc(0, 0, oR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${col},${(orbAlpha * 0.3).toFixed(3)})`;
    ctx.lineWidth   = 4 + ORB.energy * 3;
    ctx.stroke();

    ctx.restore();
  }

  // ── 8. Floating nodes on orbitals ─────────────────
  for (const nd of ORB.nodes) {
    const orb   = ORB.orbitals[nd.orbitalIdx];
    const oR    = R * orb.radiusScale;
    const ang   = orb.angle * 0.3 + nd.offset;
    const scaleY = Math.sin(orb.tilt + ORB.phase * 0.2) * 0.4 + 0.6;

    const nx = cx + Math.cos(ang) * oR;
    const ny = cy + Math.sin(ang) * oR * scaleY;

    const nAlpha = 0.6 + ORB.energy * 0.4 + Math.sin(ORB.phase * 2 + nd.pulse) * 0.2;
    const nSize  = nd.size * (0.8 + ORB.energy * 0.4);

    const ndGlow = ctx.createRadialGradient(nx, ny, 0, nx, ny, nSize * 3);
    ndGlow.addColorStop(0, `rgba(${col},${(nAlpha * 0.5).toFixed(3)})`);
    ndGlow.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = ndGlow;
    ctx.beginPath(); ctx.arc(nx, ny, nSize * 3, 0, Math.PI * 2); ctx.fill();

    ctx.beginPath();
    ctx.arc(nx, ny, nSize, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${(nAlpha * 0.9).toFixed(3)})`;
    ctx.fill();
  }

  // ── 9. Core arc flashes (reaction arc in mode 1/2/3) ──
  if (ORB.mode >= 1) {
    const arcCount = ORB.mode === 2 ? 4 : 2;
    for (let a = 0; a < arcCount; a++) {
      const startAng = ORB.phase * (2 + a) + (a * Math.PI * 0.4);
      const arcSpan  = (0.3 + ORB.energy * 0.5 + Math.sin(ORB.phase * 3 + a) * 0.2);
      const arcR     = R * (1.04 + a * 0.03 + Math.sin(ORB.phase * 4 + a) * 0.01);
      ctx.beginPath();
      ctx.arc(cx, cy, arcR, startAng, startAng + arcSpan);
      ctx.strokeStyle = `rgba(${col},${(0.35 + ORB.energy * 0.3).toFixed(3)})`;
      ctx.lineWidth   = 1.5 + ORB.energy * 1.5;
      ctx.stroke();
    }
  }

  // ── 10. Center core glow ──────────────────────────
  const coreR = 16 + ORB.energy * 18;
  const core  = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  core.addColorStop(0,   'rgba(255,255,255,0.95)');
  core.addColorStop(0.2, `rgba(${col},0.85)`);
  core.addColorStop(0.6, `rgba(${col},0.3)`);
  core.addColorStop(1,   `rgba(${col},0)`);
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();

  // Bright core dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3 + ORB.energy * 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.98)';
  ctx.fill();

  // ── 11. Listening ring pulse ──────────────────────
  if (ORB.mode === 3) {
    for (let i = 1; i <= 3; i++) {
      const r2 = R * (1.08 + i * 0.06 + Math.sin(ORB.phase * 9 + i) * 0.015);
      ctx.beginPath(); ctx.arc(cx, cy, r2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${col},${(0.12 / i).toFixed(3)})`;
      ctx.lineWidth = 0.8; ctx.stroke();
    }
  }

  // ── 12. Speaking wave rings ───────────────────────
  if (ORB.mode === 2) {
    for (let i = 1; i <= 3; i++) {
      const rw = R * (1.06 * i + Math.sin(ORB.phase * 7 * i) * 0.015);
      ctx.beginPath(); ctx.arc(cx, cy, rw, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${col},${(0.10 / i).toFixed(3)})`;
      ctx.lineWidth = 0.7; ctx.stroke();
    }
  }

  requestAnimationFrame(drawHoloSphere);
}

function setOrbMode(mode) {
  const map = { idle:0, thinking:1, speaking:2, listening:3 };
  ORB.mode = map[mode] !== undefined ? map[mode] : 0;
  document.body.className = 'orb-' + mode;
  const labels = { idle:'IDLE', thinking:'PROCESSING…', speaking:'SPEAKING', listening:'LISTENING' };
  document.getElementById('state-label').textContent = labels[mode] || 'IDLE';
}

// ─────────────────────────────────────────────────────
//  SYSTEM SPEECH
// ─────────────────────────────────────────────────────
function speakSystem(text) {
  if (!synth) return;
  synth.cancel();
  const clean = text.replace(/[*#`_~]/g, '').trim();
  utterance = new SpeechSynthesisUtterance(clean);
  utterance.pitch = 0.88; utterance.rate = 0.92; utterance.volume = 1;
  const pickVoice = () => {
    const voices = synth.getVoices();
    const v = voices.find(v => v.name.toLowerCase().includes('uk english male') && v.lang.startsWith('en'))
           || voices.find(v => v.lang.startsWith('en-')) || null;
    if (v) utterance.voice = v;
  };
  synth.getVoices().length ? pickVoice() : (synth.onvoiceschanged = pickVoice);
  synth.speak(utterance);
}

// ─────────────────────────────────────────────────────
//  AUDIO UTILITIES
// ─────────────────────────────────────────────────────
function resampleTo16k(float32, fromRate) {
  const ratio  = fromRate / 16000;
  const outLen = Math.floor(float32.length / ratio);
  const out    = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src  = i * ratio;
    const lo   = Math.floor(src);
    const hi   = Math.min(lo + 1, float32.length - 1);
    const frac = src - lo;
    const s    = float32[lo] * (1 - frac) + float32[hi] * frac;
    out[i]     = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
  }
  return out;
}

function int16ToBase64(buf) {
  const bytes = new Uint8Array(buf.buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToFloat32(b64) {
  const bin   = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
  return f32;
}

function ensureAudioCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    nativeSR = audioCtx.sampleRate;
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playGeminiChunk(base64) {
  ensureAudioCtx();
  const f32  = base64ToFloat32(base64);
  const buf  = audioCtx.createBuffer(1, f32.length, 24000);
  buf.getChannelData(0).set(f32);
  const src  = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  const now  = audioCtx.currentTime;
  if (nextPlayTime < now + 0.05) nextPlayTime = now + 0.05;
  src.start(nextPlayTime);
  nextPlayTime += buf.duration;
}

// ─────────────────────────────────────────────────────
//  BACKEND API HELPERS
// ─────────────────────────────────────────────────────
async function fetchApiKey() {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/config`);
    const data = await res.json();
    if (data.apiKey) {
      apiKey = data.apiKey;
      console.log('[VIVEK] API key loaded from backend');
      return true;
    }
  } catch (err) {
    console.warn('[VIVEK] Could not fetch API key from backend:', err.message);
  }
  return false;
}

async function createSession() {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/sessions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ personality: currentPersonality }),
    });
    const data = await res.json();
    currentSessionId = data.sessionId;
    console.log('[VIVEK] Session created:', currentSessionId);
  } catch (err) {
    console.warn('[VIVEK] Could not create session:', err.message);
    currentSessionId = null;
  }
}

async function saveMessage(role, content) {
  if (!currentSessionId) return;
  try {
    await fetch(`${BACKEND_URL}/api/sessions/${currentSessionId}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ role, content }),
    });
  } catch (err) {
    // Silent - don't disrupt voice flow
  }
}

async function loadHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '<div class="h-empty">Loading…</div>';
  try {
    const res  = await fetch(`${BACKEND_URL}/api/sessions?limit=15`);
    const data = await res.json();
    if (!data.sessions || data.sessions.length === 0) {
      list.innerHTML = '<div class="h-empty">No sessions yet.</div>';
      return;
    }
    list.innerHTML = '';
    for (const s of data.sessions) {
      const date = new Date(s.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
      const div  = document.createElement('div');
      div.className = 'h-session';
      div.innerHTML = `
        <div class="h-session-id">${s.personality.toUpperCase()} · ${date}</div>
        <div class="h-session-meta">${s.message_count || 0} messages</div>
        ${s.last_user_msg ? `<div class="h-session-preview">"${s.last_user_msg.slice(0,55)}…"</div>` : ''}
      `;
      div.onclick = () => viewSession(s.id);
      list.appendChild(div);
    }
  } catch (err) {
    list.innerHTML = '<div class="h-empty">Could not connect to backend.</div>';
  }
}

async function viewSession(id) {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/sessions/${id}`);
    const data = await res.json();
    const msgs = data.messages || [];
    const preview = msgs.slice(-4).map(m => `[${m.role.toUpperCase()}] ${m.content.slice(0, 80)}`).join('\n');
    showToast('SESSION LOADED');
    document.getElementById('transcript-text').textContent = preview || 'Empty session.';
    document.getElementById('transcript-text').classList.add('active');
  } catch (err) {
    showToast('LOAD FAILED');
  }
}

function toggleHistory() {
  const body = document.getElementById('history-body');
  const isOpen = body.classList.toggle('open');
  if (isOpen) loadHistory();
}

// ─────────────────────────────────────────────────────
//  MIC CAPTURE  →  Gemini Live streaming
// ─────────────────────────────────────────────────────
async function startMicCapture() {
  if (micStream) return;
  try {
    ensureAudioCtx();
    nativeSR  = audioCtx.sampleRate;
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    micSrcNode = audioCtx.createMediaStreamSource(micStream);
    scriptProc = audioCtx.createScriptProcessor(4096, 1, 1);

    scriptProc.onaudioprocess = function(e) {
      if (!sessionReady || !liveWs || liveWs.readyState !== WebSocket.OPEN) return;
      if (!isListening || isSpeaking) return;
      const raw       = e.inputBuffer.getChannelData(0);
      const resampled = resampleTo16k(raw, nativeSR);
      liveWs.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ data: int16ToBase64(resampled), mimeType: 'audio/pcm;rate=16000' }]
        }
      }));
      var rms = 0;
      for (var i = 0; i < raw.length; i++) rms += raw[i] * raw[i];
      ORB.listenAmp = Math.min(1, Math.sqrt(rms / raw.length) * 10);
    };

    micSrcNode.connect(scriptProc);
    scriptProc.connect(audioCtx.destination);

    setOrbMode('listening');
    const txEl = document.getElementById('transcript-text');
    txEl.textContent = 'Listening…';
    txEl.classList.add('active');

  } catch(err) {
    const txEl = document.getElementById('transcript-text');
    txEl.textContent = (err.name === 'NotAllowedError')
      ? 'Microphone access denied. Please allow mic in browser settings.'
      : 'Mic error: ' + err.message;
    txEl.classList.add('active');
    closeLiveSession();
    scheduleWakeRestart(2000);
  }
}

function stopMicCapture() {
  if (scriptProc)  { try { scriptProc.disconnect();  } catch(e) {} scriptProc  = null; }
  if (micSrcNode)  { try { micSrcNode.disconnect();  } catch(e) {} micSrcNode  = null; }
  if (micStream)   { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  ORB.listenAmp = 0;
}

function closeLiveSession() {
  stopMicCapture();
  if (liveWs) {
    try { liveWs.close(); } catch(e) {}
    liveWs = null;
  }
  sessionReady = false;
  isListening  = false;
  isSpeaking   = false;
  isThinking   = false;
  isDormant    = true;
}

// ─────────────────────────────────────────────────────
//  WAKE WORD  — fixed restart logic to avoid connection errors
// ─────────────────────────────────────────────────────
function scheduleWakeRestart(delay) {
  if (wakeRestartTimer) clearTimeout(wakeRestartTimer);
  wakeRestartTimer = setTimeout(() => {
    wakeRestartTimer = null;
    if (isDormant && apiKey && !wakeRunning) startWakeDetection();
  }, delay || 600);
}

function startWakeDetection() {
  if (!apiKey)     return;
  if (!SpeechRec)  { document.getElementById('transcript-text').textContent = 'Speech recognition not supported in this browser.'; return; }
  if (wakeRunning) return;
  if (!isDormant)  return;

  const txEl = document.getElementById('transcript-text');
  txEl.textContent = 'Say "Vivek" to activate…';
  txEl.classList.remove('active');
  setOrbMode('idle');

  try {
    wakeRec = new SpeechRec();
  } catch(e) {
    console.warn('[VIVEK] Could not create SpeechRecognition:', e);
    scheduleWakeRestart(2000);
    return;
  }

  wakeRec.continuous     = true;
  wakeRec.interimResults = true;
  wakeRec.lang           = 'en-US';
  wakeRunning            = true;

  wakeRec.onresult = function(e) {
    for (var i = e.resultIndex; i < e.results.length; i++) {
      var t = e.results[i][0].transcript.toLowerCase().trim();
      // Handle common mis-transcriptions of "Vivek"
      if (/\b(vivek|vivek|vi vek|viveek|bivek|vibek|vivec)\b/.test(t)) {
        stopWakeDetection();
        showToast('WAKE WORD DETECTED');
        txEl.textContent = 'Connecting to Gemini…';
        txEl.classList.add('active');
        var parts    = t.split(/vivek|vi vek|viveek|bivek|vibek|vivec/);
        var trailing = parts.slice(1).join('').replace(/[.,!?]/g, '').trim();
        startGeminiSession(trailing || null);
        return;
      }
    }
  };

  wakeRec.onend = function() {
    wakeRunning = false;
    wakeRec     = null;
    // Always restart if still dormant — this is the key fix for "connection error"
    if (isDormant && apiKey) scheduleWakeRestart(300);
  };

  wakeRec.onerror = function(e) {
    wakeRunning = false;
    wakeRec     = null;
    if (e.error === 'not-allowed') {
      txEl.textContent = 'Microphone access denied. Please allow mic access.';
      return;
    }
    if (e.error === 'network') {
      // Network error during speech recognition — just retry quietly
      if (isDormant && apiKey) scheduleWakeRestart(1500);
      return;
    }
    if (e.error === 'aborted' || e.error === 'no-speech') {
      if (isDormant && apiKey) scheduleWakeRestart(300);
      return;
    }
    // Any other error — retry with back-off
    if (isDormant && apiKey) scheduleWakeRestart(2000);
  };

  try {
    wakeRec.start();
  } catch(e) {
    wakeRunning = false;
    wakeRec     = null;
    scheduleWakeRestart(1000);
  }
}

function stopWakeDetection() {
  wakeRunning = false;
  if (wakeRestartTimer) { clearTimeout(wakeRestartTimer); wakeRestartTimer = null; }
  if (wakeRec) {
    try { wakeRec.stop(); } catch(e) {}
    wakeRec = null;
  }
}

// ─────────────────────────────────────────────────────
//  STOP ALL
// ─────────────────────────────────────────────────────
function stopAll() {
  closeLiveSession();
  if (synth) synth.cancel();
  isSpeaking = false;
  ORB.speakAmp = 0;
  if (speakIv) clearInterval(speakIv);
  document.getElementById('stop-btn').style.display = 'none';
  if (audioCtx) nextPlayTime = audioCtx.currentTime;
  setOrbMode('idle');
  scheduleWakeRestart(600);
}

function stopSpeaking() { stopAll(); }

function pulseSpeaking() {
  if (speakIv) clearInterval(speakIv);
  speakIv = setInterval(function() {
    if (!isSpeaking) { clearInterval(speakIv); ORB.speakAmp = 0; return; }
    ORB.speakAmp = 0.2 + Math.random() * 0.8;
  }, 90);
}

// ─────────────────────────────────────────────────────
//  GEMINI LIVE SESSION
// ─────────────────────────────────────────────────────
async function startGeminiSession(initialText) {
  if (!apiKey) {
    speakSystem("API key not loaded. Please check the backend configuration.");
    return;
  }
  if (liveWs && liveWs.readyState === WebSocket.OPEN) liveWs.close();

  stopWakeDetection();
  isDormant    = false;
  sessionReady = false;
  isListening  = true;
  isThinking   = false;
  isSpeaking   = false;
  nextPlayTime = 0;

  // Create backend session for history
  await createSession();

  const p    = PERSONALITIES[currentPersonality];
  const txEl = document.getElementById('transcript-text');
  txEl.textContent = 'Connecting to Gemini Live…';
  txEl.classList.add('active');
  setOrbMode('thinking');

  const url = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.BidiGenerateContent?key=' + apiKey;

  try {
    liveWs = new WebSocket(url);
  } catch(e) {
    txEl.textContent = 'WebSocket creation failed: ' + e.message;
    closeLiveSession();
    scheduleWakeRestart(2000);
    return;
  }

  // Connection timeout guard
  const connTimeout = setTimeout(() => {
    if (!sessionReady) {
      txEl.textContent = 'Connection timed out. Retrying…';
      closeLiveSession();
      scheduleWakeRestart(2000);
    }
  }, 12000);

  liveWs.onopen = () => {
    liveWs.send(JSON.stringify({
      setup: {
        model: 'models/gemini-2.0-flash-live-001',
        generationConfig: {
          responseModalities: ['AUDIO', 'TEXT'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: p.geminiVoice || 'Charon' }
            }
          }
        },
        systemInstruction: { parts: [{ text: p.prompt }] }
      }
    }));
  };

  let assistantBuffer = '';

  liveWs.onmessage = async (event) => {
    let data;
    try {
      const raw = (event.data instanceof Blob) ? await event.data.text() : event.data;
      data = JSON.parse(raw);
    } catch(e) { return; }

    if (data.setupComplete !== undefined) {
      clearTimeout(connTimeout);
      sessionReady = true;
      setOrbMode('listening');
      txEl.textContent = 'Listening…';
      txEl.classList.add('active');
      if (initialText) {
        saveMessage('user', initialText);
        sendTextTurn(initialText);
      } else {
        startMicCapture();
      }
      return;
    }

    if (data.serverContent) {
      const sc = data.serverContent;

      if (sc.modelTurn && sc.modelTurn.parts) {
        for (const part of sc.modelTurn.parts) {
          if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.indexOf('audio') !== -1) {
            if (!isSpeaking) {
              isSpeaking = true;
              stopMicCapture();
              setOrbMode('speaking');
              document.getElementById('stop-btn').style.display = 'block';
              pulseSpeaking();
            }
            playGeminiChunk(part.inlineData.data);
          }
          if (part.text) {
            const t = part.text;
            assistantBuffer += t;
            txEl.textContent = assistantBuffer.length > 120 ? assistantBuffer.slice(0, 120) + '…' : assistantBuffer;
            txEl.classList.add('active');
          }
        }
      }

      if (sc.turnComplete) {
        if (assistantBuffer) {
          saveMessage('assistant', assistantBuffer);
          assistantBuffer = '';
        }
        isThinking = false;
        const remaining = audioCtx ? Math.max(0, nextPlayTime - audioCtx.currentTime) : 0;
        setTimeout(function() {
          isSpeaking = false;
          ORB.speakAmp = 0;
          if (speakIv) clearInterval(speakIv);
          document.getElementById('stop-btn').style.display = 'none';
          closeLiveSession();
          txEl.textContent = 'Say "Vivek" to activate…';
          txEl.classList.remove('active');
          setOrbMode('idle');
          scheduleWakeRestart(500);
        }, remaining * 1000 + 500);
      }
    }

    if (data.error) {
      clearTimeout(connTimeout);
      const msg = (data.error.message) || 'Neural bridge error.';
      txEl.textContent = msg;
      txEl.classList.add('active');
      closeLiveSession();
      scheduleWakeRestart(2000);
    }
  };

  liveWs.onerror = function(e) {
    clearTimeout(connTimeout);
    const txEl = document.getElementById('transcript-text');
    txEl.textContent = 'Connection error. Check API key and network.';
    txEl.classList.add('active');
    closeLiveSession();
    setOrbMode('idle');
    scheduleWakeRestart(3000);
  };

  liveWs.onclose = function(e) {
    clearTimeout(connTimeout);
    sessionReady = false;
    stopMicCapture();
    if (!isDormant) {
      isDormant = true;
      setOrbMode('idle');
      scheduleWakeRestart(800);
    }
  };
}

function sendTextTurn(text) {
  if (!liveWs || liveWs.readyState !== WebSocket.OPEN) return;
  liveWs.send(JSON.stringify({
    clientContent: {
      turns: [{ role: 'user', parts: [{ text: text }] }],
      turnComplete: true
    }
  }));
  setOrbMode('thinking');
  isThinking  = true;
  isListening = false;
  const txEl = document.getElementById('transcript-text');
  txEl.textContent = text.length > 90 ? text.slice(0, 90) + '…' : text;
}

// ─────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────
var toastTimer = null;
function showToast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 2600);
}

// ─────────────────────────────────────────────────────
//  BOOT SEQUENCE
// ─────────────────────────────────────────────────────
var bootLines = ['bl1','bl2','bl3','bl4','bl5'];
var bootIdx = 0, bootPct = 0;

function runBoot() {
  var bar = document.getElementById('boot-bar');
  var pct = document.getElementById('boot-pct');
  var iv  = setInterval(function() {
    bootPct += 1.8;
    bar.style.width  = Math.min(bootPct, 100) + '%';
    pct.textContent  = Math.min(Math.floor(bootPct), 100) + '%';
    if (bootPct % 20 < 1.9 && bootIdx < bootLines.length) {
      var el = document.getElementById(bootLines[bootIdx]);
      if (el) { el.style.opacity = '1'; el.classList.add('ok'); }
      bootIdx++;
    }
    if (bootPct >= 100) {
      clearInterval(iv);
      setTimeout(function() {
        var overlay = document.getElementById('boot-overlay');
        overlay.style.opacity = '0';
        setTimeout(async function() {
          overlay.style.display = 'none';
          const txEl = document.getElementById('transcript-text');

          // Fetch API key from backend
          const loaded = await fetchApiKey();
          if (loaded) {
            txEl.textContent = 'Say "Vivek" to activate…';
            txEl.classList.add('active');
            speakSystem('V.I.V.E.K neural core online. Say Vivek to activate.');
            setTimeout(startWakeDetection, 1200);
          } else {
            txEl.textContent = 'Backend offline. Check BACKEND_URL in app.js.';
            txEl.classList.add('active');
          }
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
requestAnimationFrame(drawHoloSphere);
runBoot();

canvas.addEventListener('click', function() {
  ensureAudioCtx();
  if (isSpeaking || isListening || isThinking) {
    stopAll();
  } else if (isDormant && apiKey) {
    startGeminiSession(null);
  } else if (!apiKey) {
    showToast('BACKEND NOT CONNECTED');
  }
});
