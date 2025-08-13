



require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

// --- Config ---
const PORT = process.env.PORT || 3000;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
/**
 * Try asking for audio directly from Gemini. If model/key doesn’t support audio out,
 * we’ll fall back to text and let the browser do TTS.
 */
const PREFER_AUDIO_FROM_GEMINI = true;

// --- App/Server ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve frontend (adjust if needed)
app.use(express.static(path.join(__dirname, '../frontend')));

// --- Utilities ---
function base64ToBuffer(b64) {
  return Buffer.from(b64, 'base64');
}
function bufferToBase64(buf) {
  return buf.toString('base64');
}

/**
 * Simple per-connection state:
 *  - collect PCM16 frames
 *  - allow abort (interrupt)
 */
class SessionState {
  constructor(ws) {
    this.ws = ws;
    this.resetUtterance();
    this.playing = false; // for bookkeeping
    this.currentAbortController = null;
  }
  resetUtterance() {
    this.pcmChunks = []; // array of Node Buffers with PCM16 mono 16k frames
  }
  abortInFlight() {
    if (this.currentAbortController) {
      try { this.currentAbortController.abort(); } catch (_) {}
      this.currentAbortController = null;
    }
  }
}

function createWavHeader({ sampleRate, channels, bitDepth, dataLength }) {
  const header = Buffer.alloc(44);
  const totalLength = dataLength + 36;
  header.write("RIFF", 0); // RIFF identifier
  header.writeUInt32LE(totalLength, 4); // File size (data + 36 bytes for header)
  header.write("WAVE", 8); // WAVE identifier
  header.write("fmt ", 12); // fmt chunk identifier
  header.writeUInt32LE(16, 16); // fmt chunk size (16 for PCM)
  header.writeUInt16LE(1, 20); // Audio format (1 = PCM)
  header.writeUInt16LE(channels, 22); // Number of channels
  header.writeUInt32LE(sampleRate, 24); // Sample rate
  header.writeUInt32LE((sampleRate * channels * bitDepth) / 8, 28); // Byte rate
  header.writeUInt16LE((channels * bitDepth) / 8, 32); // Block align
  header.writeUInt16LE(bitDepth, 34); // Bits per sample
  header.write("data", 36); // data chunk identifier
  header.writeUInt32LE(dataLength, 40); // data chunk size
  return header;
}


function createWavFile(pcmBuffer, { sampleRate, channels, bitDepth }) {
  const wavHeader = createWavHeader({
    sampleRate,
    channels,
    bitDepth,
    dataLength: pcmBuffer.length,
  });
  return Buffer.concat([wavHeader, pcmBuffer]);
}


async function callGeminiWithAudio({ pcmBuffer, languageHint, signal }) {
  // Assume your audio is 16k Hz, 1 channel, 16-bit
  const audioParams = {
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
  }; // ✅ FIX: Create a proper WAV file buffer from the raw PCM data
  const wavBuffer = createWavFile(pcmBuffer, audioParams);
  const audioBase64 = bufferToBase64(wavBuffer);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;
  const systemInstruction = `
You are "Rev", the official AI assistant of Revolt Motors.
Only discuss Revolt Motors (products, pricing, specs, availability, service, charging, EMI, test rides).
If the user speaks in Hindi, reply in Hindi; if English, reply in English; if mixed, respond bilingually.
Keep answers conversational and short for voice.
`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        role: "user",
        parts: [
          ...(languageHint ? [{ text: `LanguageHint: ${languageHint}` }] : []),
          {
            inlineData: {
              mimeType: "audio/wav",
              data: audioBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "text/plain",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": GOOGLE_API_KEY,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errJson = await safeJson(res);
    const msg = errJson?.error?.message || res.statusText;
    const e = new Error(`Gemini API error: ${res.status} ${msg}`);
    e.status = res.status;
    e.details = errJson;
    throw e;
  }

  const json = await res.json();

  const textParts = json?.candidates?.[0]?.content?.parts || [];
  const text = textParts
    .map((p) => p.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  return { type: "text", text };
}



// --- Gemini call (audio in → text out, then TTS can be done client-side) ---
// async function callGeminiWithAudio({ pcmBuffer, languageHint, signal }) {
//   const audioBase64 = bufferToBase64(pcmBuffer);
//   const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;

//   const systemInstruction = `
// You are "Rev", the official AI assistant of Revolt Motors.
// Only discuss Revolt Motors (products, pricing, specs, availability, service, charging, EMI, test rides).
// If the user speaks in Hindi, reply in Hindi; if English, reply in English; if mixed, respond bilingually.
// Keep answers conversational and short for voice.
// `;

//   const body = {
//     // ✅ FIX — must be camelCase
//     systemInstruction: {
//       parts: [{ text: systemInstruction }]
//     },
//     contents: [
//       {
//         role: 'user',
//         parts: [
//           ...(languageHint ? [{ text: `LanguageHint: ${languageHint}` }] : []),
//           {
//             // ✅ FIX — must be camelCase and correct mime type
//             inlineData: {
//               mimeType: 'audio/wav', // Change if your audio is not WAV
//               data: audioBase64
//             }
//           }
//         ]
//       }
//     ],
//     generationConfig: {
//       // ✅ Only allowed mime types
//       responseMimeType: 'text/plain'
//     }
//   };

//   const res = await fetch(url, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'X-goog-api-key': GOOGLE_API_KEY
//     },
//     body: JSON.stringify(body),
//     signal
//   });

//   if (!res.ok) {
//     const errJson = await safeJson(res);
//     const msg = errJson?.error?.message || res.statusText;
//     const e = new Error(`Gemini API error: ${res.status} ${msg}`);
//     e.status = res.status;
//     e.details = errJson;
//     throw e;
//   }

//   const json = await res.json();

//   const textParts = json?.candidates?.[0]?.content?.parts || [];
//   const text = textParts.map(p => p.text).filter(Boolean).join('\n').trim();

//   return { type: 'text', text };
// }




async function safeJson(res) {
  try { return await res.json(); } catch (_) { return null; }
}

// --- WebSocket connections ---
wss.on('connection', (ws) => {
  console.log('Client connected.');

  const session = new SessionState(ws);

  ws.on('message', async (raw) => {
    // We accept JSON messages with {type, ...}
    // type: 'audio'  -> binary base64 chunk or ArrayBuffer (frontend sends base64 string)
    // type: 'end'    -> end of utterance; call Gemini
    // type: 'stop'   -> interrupt any in-flight request & stop playback on client
    // type: 'text'   -> (optional) text query fallback

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      console.error('Invalid message from client (not JSON)', e);
      return;
    }

    if (msg.type === 'audio') {
      // msg.chunk should be base64 PCM16 mono 16k
      if (typeof msg.chunk === 'string') {
        session.pcmChunks.push(base64ToBuffer(msg.chunk));
      }
      return;
    }

    if (msg.type === 'stop') {
      // Interrupt LLM call & tell client to stop audio now.
      session.abortInFlight();
      ws.send(JSON.stringify({ type: 'stopped' }));
      return;
    }

    if (msg.type === 'end') {
      // End of an utterance: join audio → call Gemini → stream result
      const pcmBuffer = Buffer.concat(session.pcmChunks);
      session.resetUtterance();

      // Small guard
      if (!pcmBuffer.length) {
        ws.send(JSON.stringify({ type: 'info', info: 'No audio received' }));
        return;
      }

      // quick heuristic language hint via byte energy / (client can also send a hint)
      const langHint = msg.language || ''; // let the client send its detected language, else empty

      const ac = new AbortController();
      session.currentAbortController = ac;
      try {
        const result = await callGeminiWithAudio({
          pcmBuffer,
          languageHint: langHint,
          signal: ac.signal
        });

        // If interrupted during fetch, don’t send
        if (ac.signal.aborted) return;

        // deliver
        if (result.type === 'audio') {
          ws.send(JSON.stringify({
            type: 'audio',
            mimeType: result.mimeType,
            base64: result.base64
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'text',
            text: result.text
          }));
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          // ignore, user interrupted
          return;
        }
        console.error('Gemini error:', err);
        ws.send(JSON.stringify({
          type: 'error',
          error: err.message,
          details: err.details || null
        }));
      } finally {
        session.currentAbortController = null;
      }
      return;
    }

    if (msg.type === 'text') {
      // Optional: text query fallback (no audio in)
      const ac = new AbortController();
      session.currentAbortController = ac;
      try {
        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;
        const body = {
          systemInstruction: {
            parts: [{ text: `You are Rev (Revolt Motors only). Keep replies short for voice. Reply in the user's language.` }]
          },
          contents: [{ parts: [{ text: msg.text || '' }] }]
        };
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GOOGLE_API_KEY },
          body: JSON.stringify(body),
          signal: ac.signal
        });
        if (!res.ok) {
          const errJson = await safeJson(res);
          const msgx = errJson?.error?.message || res.statusText;
          throw new Error(`Gemini API error: ${res.status} ${msgx}`);
        }
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const text = parts.map(p => p.text).filter(Boolean).join('\n').trim();
        ws.send(JSON.stringify({ type: 'text', text }));
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Gemini text error:', err);
          ws.send(JSON.stringify({ type: 'error', error: err.message }));
        }
      } finally {
        session.currentAbortController = null;
      }
      return;
    }
  });

  ws.on('close', () => {
    session.abortInFlight();
    console.log('Client disconnected.');
  });

  ws.on('error', (e) => {
    console.error('Client WS error:', e);
    session.abortInFlight();
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
