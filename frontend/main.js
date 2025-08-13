// Frontend mic capture → PCM16 → WS → Gemini → (audio|text) → play / TTS
let ws;
let mediaStream;
let audioCtx;
let processor;
let sourceNode;

let recording = false;
let playingAudio = false;

const $ = (id) => document.getElementById(id);
const logDiv = $('log');
const statusSpan = $('status');
const btnConnect = $('btnConnect');
const btnMic = $('btnMic');
const btnStop = $('btnStop');
const btnSend = $('btnSend');
const textInput = $('textInput');
const audioEl = $('audio');

// --- UI helpers ---
function logBubble(text, who='bot') {
  const div = document.createElement('div');
  div.className = 'bubble ' + (who === 'me' ? 'me' : 'bot');
  div.textContent = text;
  logDiv.appendChild(div);
  logDiv.scrollTop = logDiv.scrollHeight;
}
function setStatus(s) { statusSpan.textContent = s; }
function enableControls(connected) {
  btnConnect.disabled = false;
  btnMic.disabled = !connected;
  btnStop.disabled = !connected;
  btnSend.disabled = !connected;
}

// --- Language detection (very rough, client-side heuristic) ---
function detectLanguage(text) {
  // quick check for Devanagari chars
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasDevanagari && !hasLatin) return 'hi-IN';
  if (!hasDevanagari && hasLatin) return 'en-IN';
  if (hasDevanagari && hasLatin) return 'mixed';
  return ''; // unknown
}

// --- PCM16 encoder (Float32 [-1..1] -> Int16) ---
function floatTo16BitPCM(float32Array) {
  const out = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out;
}
function bufferToBase64(buf) {
  // buf is ArrayBuffer or TypedArray
  const bytes = (buf instanceof ArrayBuffer) ? new Uint8Array(buf) : new Uint8Array(buf.buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// --- WebSocket ---
btnConnect.onclick = () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
    return;
  }
  ws = new WebSocket(`ws://${location.host}`);
  setStatus('connecting...');
  btnConnect.textContent = 'Connecting...';
  btnConnect.disabled = true;

  ws.onopen = () => {
    setStatus('connected');
    btnConnect.textContent = 'Disconnect';
    enableControls(true);
  };
  ws.onclose = () => {
    setStatus('disconnected');
    btnConnect.textContent = 'Connect';
    enableControls(false);
    stopMic();
  };
  ws.onerror = (e) => {
    console.error('WS error', e);
    setStatus('error');
    enableControls(false);
  };
  ws.onmessage = async (evt) => {
    const msg = JSON.parse(evt.data);

    if (msg.type === 'stopped') {
      // server confirmed abort
      stopAudioPlayback();
      return;
    }
    if (msg.type === 'info') {
      logBubble(msg.info, 'bot');
      return;
    }
    if (msg.type === 'error') {
      logBubble('Error: ' + msg.error, 'bot');
      return;
    }
    if (msg.type === 'text') {
      logBubble(msg.text, 'bot');
      // Fallback: TTS in browser (auto language)
      speakInBrowser(msg.text);
      return;
    }
    if (msg.type === 'audio') {
      // Play audio (ogg/opus) from server (Gemini audio)
      try {
        stopAudioPlayback();
        const blob = new Blob([base64ToArrayBuffer(msg.base64)], { type: msg.mimeType || 'audio/ogg' });
        audioEl.src = URL.createObjectURL(blob);
        playingAudio = true;
        await audioEl.play();
      } catch (e) {
        console.warn('Audio play failed, falling back to TTS:', e);
        // fallback to TTS if the browser refuses to play
      }
      return;
    }
  };
};

// --- Mic capture ---
btnMic.onclick = async () => {
  if (recording) { 
    endUtterance();
    return;
  }
  await startMic();
};
btnStop.onclick = () => {
  // Interrupt: stop playback + tell server to abort
  stopAudioPlayback();
  ws?.send(JSON.stringify({ type: 'stop' }));
  // Also stop recording if recording
  if (recording) stopMic(/*no end message*/ true);
};

async function startMic() {
  try {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      alert('Connect first.');
      return;
    }
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 }, video: false });
    audioCtx = new AudioContext({ sampleRate: 16000 });
    sourceNode = audioCtx.createMediaStreamSource(mediaStream);

    // Use ScriptProcessor for broad compatibility (AudioWorklet is nicer but longer setup)
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    sourceNode.connect(processor);
    processor.connect(audioCtx.destination);

    processor.onaudioprocess = (e) => {
      if (!recording) return;
      const input = e.inputBuffer.getChannelData(0);
      const int16 = floatTo16BitPCM(input);
      const b64 = bufferToBase64(int16.buffer);
      ws?.send(JSON.stringify({ type: 'audio', chunk: b64 }));
    };

    recording = true;
    btnMic.textContent = 'Finish Utterance';
    logBubble('🎤 Listening… (speak Hindi or English)', 'me');
  } catch (e) {
    console.error(e);
    alert('Mic error: ' + e.message);
  }
}

function endUtterance() {
  // Send end signal with (optional) language hint (we can use Web Speech or heuristic later)
  const textProbe = ''; // (optional) if you also did client STT
  const lang = detectLanguage(textProbe); // we don't have text if using pure audio; send empty
  ws?.send(JSON.stringify({ type: 'end', language: lang }));
  stopMic(/*no end*/ false);
}

function stopMic(silent = false) {
  recording = false;
  btnMic.textContent = 'Start Talking';
  try { processor && processor.disconnect(); } catch (_) {}
  try { sourceNode && sourceNode.disconnect(); } catch (_) {}
  try { audioCtx && audioCtx.close(); } catch (_) {}
  try {
    mediaStream?.getTracks().forEach(t => t.stop());
  } catch (_) {}
  mediaStream = null;
  audioCtx = null;
  processor = null;
  sourceNode = null;
  if (!silent) logBubble('⏹️ Utterance sent.', 'me');
}

// --- Client TTS fallback ---
function speakInBrowser(text) {
  try {
    stopAudioPlayback();
    const lang = detectLanguage(text);
    const utter = new SpeechSynthesisUtterance(text);
    // Prefer Indian voices when possible
    if (lang === 'hi-IN') utter.lang = 'hi-IN';
    else if (lang === 'en-IN') utter.lang = 'en-IN';
    else utter.lang = 'en-IN';
    playingAudio = true;
    utter.onend = () => { playingAudio = false; };
    speechSynthesis.cancel(); // stop anything ongoing
    speechSynthesis.speak(utter);
  } catch (e) {
    console.warn('TTS failed:', e);
  }
}

function stopAudioPlayback() {
  try { speechSynthesis.cancel(); } catch (_) {}
  try {
    audioEl.pause();
    audioEl.currentTime = 0;
    if (audioEl.src) URL.revokeObjectURL(audioEl.src);
    audioEl.src = '';
  } catch (_) {}
  playingAudio = false;
}

// --- Text fallback send ---
btnSend.onclick = () => {
  const text = textInput.value.trim();
  if (!text) return;
  logBubble(text, 'me');
  ws?.send(JSON.stringify({ type: 'text', text }));
  textInput.value = '';
};
