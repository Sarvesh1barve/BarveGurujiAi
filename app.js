/* app.js
   Barve Guruji AI - Production-grade client-side Gemini chat (PWA)
   Key upgrades:
   - Interpreter stage: rewrites user query with date resolution + intent expansion
   - Guruji stage: strict persona + Marathi/English enforcement
   - Marathi fallback translator: if reply comes in English while Marathi mode, auto-translate
   - IST date grounding + relative-date understanding
   - Better error handling incl. 429 retryDelay
*/

const STORAGE = {
  API_KEY: "bg_api_key",
  LANGUAGE: "bg_language", // "mr" | "en"
  SESSIONS: "bg_sessions",
  ACTIVE_SESSION: "bg_active_session_id",
};

const DEFAULT_LANGUAGE = "mr";
const MAX_HISTORY = 18; // increased for better context

// -----------------------------
// SYSTEM PROMPT (MUST be exact)
// -----------------------------
const SYSTEM_PROMPT = `
Role: You are Barve Guruji (बर्वे गुरुजी), an 85-year-old Vedic Astrologer (Jyotish Ratna) and spiritual guide based in Sadashiv Peth, Pune, Maharashtra.

CORE IDENTITY & MANNERISMS:

Voice: You speak with the authority of a Rishi and the affection of a Grandfather (Ajoba).

Phrasing: Start interactions with "Namaskar Bal" (Child) or "Hari Om". Use Maharashtrian mannerisms.

Language:

Marathi Mode: Use pure, formal "Pramaan" Marathi.

English Mode: Speak English but use Vedic terms (e.g., "Your Grahaman is weak," "Do this Upay").

KNOWLEDGE BASE (STRICT):

Panchang: You strictly follow the Ruikar and Date Panchang methodologies. Always acknowledge the current Tithi/Nakshatra before answering.

Astrology: You use Brihat Parashara Hora Shastra. You calculate Lagna, Rashi, and Shadbala.

Prashna & Tarot: Uniquely, you use Tarot cards as a form of "Prashna Kundali" to clarify doubts when Vedic charts are ambiguous, blending them seamlessly.

INTERACTION PROTOCOL:

Honesty with Empathy:

If a Muhurta or prediction is NEGATIVE (e.g., Mrityu Yoga, Bhadra, Kantaka Shani), say it clearly. Do not lie.

Immediately follow the negative news with a Sattvic Remedy (Upay). Never leave the user in fear.

Example: "No, Bal. Today is Amavasya, not good for Shubha Karya. However, if urgent, perform a Ganpati Havan..."

Remedies: Prescribe Mantras, Stotras (like Ram Raksha), specific Pujas, or Daan (Charity). Do not suggest expensive stones immediately; suggest Karma correction first.

FORMATTING:

Use Bold for Dates, Tithis, and 'Yes/No' verdicts.

Use Bullet points for lists.
`.trim();

// -----------------------------
// Model + endpoint strategy
// -----------------------------
// You listed available models from your project. Best general choice:
const GURUJI_MODEL = "gemini-2.5-flash"; // higher quality than lite
const INTERPRETER_MODEL = "gemini-flash-lite-latest"; // fast + cheap + stable alias

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GURUJI_URL = `${API_BASE}/${encodeURIComponent(GURUJI_MODEL)}:generateContent`;
const INTERPRETER_URL = `${API_BASE}/${encodeURIComponent(INTERPRETER_MODEL)}:generateContent`;

// -----------------------------
// DOM helpers
// -----------------------------
const $ = (sel) => document.querySelector(sel);

const offlineBanner = $("#offlineBanner");
const quickActionsDiv = $("#quickActions");
const chatArea = $("#chatArea");
const messageInput = $("#messageInput");
const sendBtn = $("#sendBtn");
const typingIndicator = $("#typingIndicator");

const settingsPanel = $("#settingsPanel");
const settingsBtn = $("#settingsBtn");
const closeSettingsBtn = $("#closeSettings");

const langToggle = $("#langToggle");
const langLabel = $("#langLabel");
const settingsLang = $("#settingsLang");

const apiKeyInput = $("#apiKeyInput");
const saveApiKeyBtn = $("#saveApiKey");
const forgetApiKeyBtn = $("#forgetApiKey");

const sessionsListDiv = $("#sessionsList");
const newSessionBtn = $("#newSessionBtn");

const exportCurrentBtn = $("#exportCurrentBtn");
const exportAllBtn = $("#exportAllBtn");
const importFileInput = $("#importFileInput");

const inputForm = $("#inputForm");

let sessions = [];
let activeSessionId = null;

let pendingRetry = null; // {sessionId, lastUserText, retryAtMs}

// -----------------------------
// Utils
// -----------------------------
function nowISO() {
  return new Date().toISOString();
}

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className =
    "fixed bottom-5 left-1/2 transform -translate-x-1/2 bg-maroon text-cream px-4 py-2 rounded shadow-lg text-sm z-50";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function showTyping(show) {
  if (!typingIndicator) return;
  typingIndicator.classList.toggle("hidden", !show);
}

function setSendingDisabled(disabled) {
  if (sendBtn) {
    sendBtn.disabled = disabled;
    sendBtn.classList.toggle("opacity-50", disabled);
    sendBtn.classList.toggle("cursor-not-allowed", disabled);
  }
  if (messageInput) messageInput.disabled = disabled;
}

function maskKey(key) {
  if (!key) return "";
  if (key.length <= 4) return "••••";
  return "••••••••••••••••" + key.slice(-4);
}

function getApiKey() {
  return (localStorage.getItem(STORAGE.API_KEY) || "").trim();
}

function getLanguage() {
  return localStorage.getItem(STORAGE.LANGUAGE) || DEFAULT_LANGUAGE;
}

function updateLanguageUI() {
  const lang = getLanguage();
  if (langLabel) langLabel.textContent = lang === "mr" ? "मराठी" : "English";
  if (settingsLang) settingsLang.value = lang;
}

function escapeHTML(s) {
  return (s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderTextMinimalFormatting(text) {
  // Minimal safe formatting: **bold** + newlines.
  return escapeHTML(text)
    .replace(/\n/g, "<br/>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

// -----------------------------
// IST date grounding helpers
// -----------------------------
function getISTDateParts(date = new Date()) {
  // Convert to IST by using toLocaleString with Asia/Kolkata then parse
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const dd = parts.find(p => p.type === "day")?.value || "01";
  const mm = parts.find(p => p.type === "month")?.value || "01";
  const yyyy = parts.find(p => p.type === "year")?.value || "1970";
  return { dd, mm, yyyy };
}

function istDateISO(date = new Date()) {
  const { dd, mm, yyyy } = getISTDateParts(date);
  return `${yyyy}-${mm}-${dd}`;
}

function istDateHuman(date = new Date()) {
  // e.g. 08 February 2026
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return fmt.format(date);
}

function addDaysIST(baseDate, days) {
  // Add days relative to IST date boundary
  const iso = istDateISO(baseDate);
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

// -----------------------------
// Interpreter prompt
// -----------------------------
function buildInterpreterPrompt(lang) {
  const todayISO = istDateISO(new Date());
  const tomorrowISO = istDateISO(addDaysIST(new Date(), 1));
  const dayAfterISO = istDateISO(addDaysIST(new Date(), 2));
  const todayHuman = istDateHuman(new Date());
  const tomorrowHuman = istDateHuman(addDaysIST(new Date(), 1));
  const dayAfterHuman = istDateHuman(addDaysIST(new Date(), 2));

  // This interpreter returns ONLY a rewritten query string.
  // It resolves relative dates and expands shorthand Marathi.
  return `
You are a query interpreter for a Jyotish assistant app.
Your job: rewrite the user's message into a clear, complete request for an astrologer.

TIME CONTEXT (IST):
- Today (IST): ${todayHuman} (${todayISO})
- Tomorrow (IST): ${tomorrowHuman} (${tomorrowISO})
- Day after tomorrow (IST): ${dayAfterHuman} (${dayAfterISO})

RELATIVE DATE RULES:
- "udya" / "उद्या" / "tomorrow" => Tomorrow (IST)
- "aaj" / "आज" / "today" => Today (IST)
- "parva" / "परवा" / "day after tomorrow" => Day after tomorrow (IST)
If no date words are used, keep it as is.

DOMAIN EXPANSION RULES:
- "agnivas" / "अग्निवास" => "Calculate Agni Vas for the referenced date and tell if Havan/Hom is allowed. Be strict."
- "panchang" / "पंचांग" => include tithi, nakshatra, yoga, karan, rahukaal and verdict.
- "muhurta" / "मुहूर्त" => ask for shubha/ashubha and avoid periods.

LANGUAGE MODE:
- The user interface language is: ${lang === "mr" ? "Marathi" : "English"}.
But your output must be ONLY the rewritten query in the same language as the user's message.
(If user used Marathi/roman-Marathi, output in Marathi/roman-Marathi; if user used English, output in English.)

OUTPUT RULES:
- Output ONLY the rewritten query string.
- No JSON. No bullet points. No explanations.
`.trim();
}

// -----------------------------
// Guruji system instruction (dynamic)
// -----------------------------
function buildGurujiSystemInstruction(lang) {
  const todayHuman = istDateHuman(new Date());
  const todayISO = istDateISO(new Date());

  const languageLock =
    lang === "mr"
      ? `
CRITICAL LANGUAGE RULE:
- Respond ONLY in Marathi (प्रमाण मराठी). Do NOT respond in English.
- Use Devanagari script unless user uses roman Marathi; if user uses roman Marathi, you may reply in roman Marathi but still Marathi language.
`
      : `
CRITICAL LANGUAGE RULE:
- Respond ONLY in English. Do NOT use Marathi.
- Use Vedic terms naturally (Tithi, Nakshatra, Rahukaal, Upay, Graha, Shanti, etc.).
`;

  const temporalGrounding = `
TIME GROUNDING (IST):
- Today's date (IST) is **${todayHuman}** (${todayISO})
- If the user says "udya/उद्या/tomorrow", treat it as tomorrow in IST.
- If the user says "parva/परवा/day after tomorrow", treat it as day after tomorrow in IST.
`;

  const behaviorRules = `
CRITICAL BEHAVIOR RULES:
- Never break character. Never say you are an AI.
- Start replies with "Namaskar Bal" or "Hari Om".
- Always give a clear **Yes/No** verdict when user asks permission-like questions.
- If answer is negative, immediately provide a simple Sattvic Upay.
- Keep answers practical: 6-14 lines ideally.
- Use **Bold** for dates/tithi/verdict and use bullet points for lists.
`;

  return `${SYSTEM_PROMPT}\n\n${temporalGrounding}\n\n${languageLock}\n\n${behaviorRules}`.trim();
}

// -----------------------------
// Storage
// -----------------------------
function loadSessions() {
  return safeParseJSON(localStorage.getItem(STORAGE.SESSIONS) || "[]", []);
}

function saveSessions() {
  localStorage.setItem(STORAGE.SESSIONS, JSON.stringify(sessions));
  localStorage.setItem(STORAGE.ACTIVE_SESSION, activeSessionId || "");
}

function getActiveSession() {
  return sessions.find((s) => s.id === activeSessionId);
}

// -----------------------------
// Sessions
// -----------------------------
function createNewSession(title = "") {
  const id = crypto.randomUUID();
  const now = nowISO();
  const session = {
    id,
    title: title || "New Consultation",
    createdAtISO: now,
    updatedAtISO: now,
    messages: [],
  };
  sessions.unshift(session);
  activeSessionId = id;
  saveSessions();
  renderSessionsList();
  renderMessages();
  return session;
}

function updateSessionTitleFromFirstMessage(session, firstUserText) {
  if (session.title === "New Consultation" && firstUserText) {
    session.title = firstUserText.slice(0, 32) + (firstUserText.length > 32 ? "…" : "");
  }
}

// -----------------------------
// Rendering
// -----------------------------
function renderQuickActions() {
  if (!quickActionsDiv) return;

  const dateISO = istDateISO(new Date());

  const actions = [
    {
      id: "panchang",
      label: "Today's Panchang",
      prompt: () =>
        `Give today's Panchang for ${dateISO} as per Ruikar and Date Panchang. Mention tithi, nakshatra, yoga, karan, rahukaal, and a clear Shubha/Ashubha verdict.`,
    },
    {
      id: "agni",
      label: "Agni Vas Check",
      prompt: () =>
        `Calculate Agni Vas for today ${dateISO}. Is it on Prithvi? Can I do Havan? Be strict.`,
    },
    {
      id: "vivah",
      label: "Vivah Muhurta",
      prompt: () =>
        `List Vivah Muhurtas for the next 3 months based on Date Panchang. Highlight days to avoid due to Guru/Shukra Ast.`,
    },
    {
      id: "satyanarayan",
      label: "Satyanarayan Dates",
      prompt: () =>
        `List upcoming Purnima and Sankashti Chaturthi dates suitable for Satyanarayan Pooja.`,
    },
    {
      id: "shanti",
      label: "Shanti Muhurta",
      prompt: () =>
        `Suggest Shanti Muhurtas in next 30 days for Graha Shanti and home puja. Mention days to avoid and give simple upay.`,
    },
    {
      id: "new",
      label: "New Consultation",
      prompt: null,
    },
  ];

  quickActionsDiv.innerHTML = "";
  actions.forEach((a) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "flex-none bg-saffron text-maroon px-3 py-1 rounded whitespace-nowrap hover:bg-maroon hover:text-cream transition focus:outline-none focus:ring-2 focus:ring-cream";
    btn.textContent = a.label;

    btn.addEventListener("click", () => {
      if (a.id === "new") {
        createNewSession();
        showToast("New consultation started");
        return;
      }
      insertUserMessage(a.prompt());
    });

    quickActionsDiv.appendChild(btn);
  });
}

function renderMessages() {
  if (!chatArea) return;

  chatArea.innerHTML = "";
  const session = getActiveSession();
  if (!session) return;

  session.messages.forEach((msg) => {
    const wrapper = document.createElement("div");
    wrapper.className = "flex";

    const bubble = document.createElement("div");
    bubble.classList.add("max-w-[82%]", "px-4", "py-2", "rounded-lg", "shadow");
    bubble.style.wordBreak = "break-word";

    if (msg.role === "user") {
      wrapper.classList.add("justify-end");
      bubble.classList.add("bg-saffron", "text-maroon", "self-end");
    } else {
      wrapper.classList.add("justify-start");
      bubble.classList.add("bg-maroon", "bg-opacity-10", "text-maroon");
    }

    bubble.innerHTML = renderTextMinimalFormatting(msg.content || "");
    wrapper.appendChild(bubble);
    chatArea.appendChild(wrapper);
  });

  chatArea.scrollTop = chatArea.scrollHeight;
}

function renderSessionsList() {
  if (!sessionsListDiv) return;

  sessionsListDiv.innerHTML = "";
  sessions.forEach((s) => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between border border-maroon rounded p-2";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "flex-1 text-left truncate hover:underline";
    openBtn.textContent = s.title;
    openBtn.title = new Date(s.updatedAtISO).toLocaleString();

    openBtn.addEventListener("click", () => {
      activeSessionId = s.id;
      saveSessions();
      renderMessages();
      renderSessionsList();
      if (settingsPanel) settingsPanel.classList.add("hidden");
    });

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className =
      "ml-2 text-xs bg-saffron text-maroon px-2 py-1 rounded hover:bg-maroon hover:text-cream transition";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", () => {
      const newName = prompt("Rename consultation", s.title);
      if (newName) {
        s.title = newName;
        s.updatedAtISO = nowISO();
        saveSessions();
        renderSessionsList();
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className =
      "ml-2 text-xs bg-maroon text-cream px-2 py-1 rounded hover:bg-saffron hover:text-maroon transition";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      if (!confirm("Delete this consultation?")) return;

      sessions = sessions.filter((x) => x.id !== s.id);
      if (activeSessionId === s.id) {
        if (sessions.length) activeSessionId = sessions[0].id;
        else createNewSession();
      }
      saveSessions();
      renderSessionsList();
      renderMessages();
    });

    row.appendChild(openBtn);
    row.appendChild(renameBtn);
    row.appendChild(deleteBtn);
    sessionsListDiv.appendChild(row);
  });
}

// -----------------------------
// Gemini helpers
// -----------------------------
function extractTextFromGemini(data) {
  const c0 = data?.candidates?.[0];
  const parts = c0?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => p.text || "").join("");
}

function parseRetryDelaySeconds(errText) {
  try {
    const obj = JSON.parse(errText);
    const retryDelay = obj?.error?.details?.find(d => d["@type"]?.includes("RetryInfo"))?.retryDelay;
    if (retryDelay && typeof retryDelay === "string" && retryDelay.endsWith("s")) {
      const sec = parseInt(retryDelay.replace("s", ""), 10);
      return Number.isFinite(sec) ? sec : null;
    }
  } catch {
    // ignore
  }
  return null;
}

function looksEnglish(text) {
  // Cheap heuristic: lots of ASCII letters and very few Devanagari characters
  const s = text || "";
  const devanagariCount = (s.match(/[\u0900-\u097F]/g) || []).length;
  const latinCount = (s.match(/[A-Za-z]/g) || []).length;
  // If Marathi mode and reply has lots of latin and almost no Devanagari -> likely English
  return latinCount > 40 && devanagariCount < 10;
}

async function geminiFetch(url, apiKey, payload, timeoutMs = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(t);

    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, text };
    }
    return { ok: true, status: res.status, json: safeParseJSON(text, null), text };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, status: 0, text: String(err?.message || err) };
  }
}

// -----------------------------
// Stage 1: Interpreter
// -----------------------------
async function interpretUserQuery(rawUserText, apiKey) {
  const lang = getLanguage();
  const prompt = buildInterpreterPrompt(lang);

  const payload = {
    systemInstruction: {
      parts: [{ text: prompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: rawUserText }],
      },
    ],
    generationConfig: {
      temperature: 0.15,
      topP: 0.9,
      maxOutputTokens: 240,
    },
  };

  const result = await geminiFetch(INTERPRETER_URL, apiKey, payload, 20000);
  if (!result.ok) {
    // If interpreter fails, fallback to raw user text
    console.warn("Interpreter failed:", result.status, result.text);
    return rawUserText;
  }

  const rewritten = extractTextFromGemini(result.json)?.trim();
  return rewritten || rawUserText;
}

// -----------------------------
// Marathi enforcement fallback translator
// -----------------------------
async function translateToMarathiIfNeeded(replyText, apiKey) {
  const lang = getLanguage();
  if (lang !== "mr") return replyText;
  if (!looksEnglish(replyText)) return replyText;

  const payload = {
    systemInstruction: {
      parts: [{
        text: `
Translate the assistant response into pure, formal Marathi (प्रमाण मराठी).
Rules:
- Keep the meaning identical.
- Preserve **bold** markers exactly.
- Preserve bullet lists and line breaks.
- Do NOT add extra content.
Output ONLY the translated text.
`.trim()
      }],
    },
    contents: [{ role: "user", parts: [{ text: replyText }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1400 },
  };

  const result = await geminiFetch(INTERPRETER_URL, apiKey, payload, 25000);
  if (!result.ok) return replyText;

  const out = extractTextFromGemini(result.json)?.trim();
  return out || replyText;
}

// -----------------------------
// Stage 2: Guruji
// -----------------------------
function buildGurujiPayload(sessionMessages, finalUserText) {
  const lang = getLanguage();
  const system = buildGurujiSystemInstruction(lang);

  const history = sessionMessages
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  // Append the final user text explicitly (so interpreter output is what model sees)
  history.push({
    role: "user",
    parts: [{ text: finalUserText }],
  });

  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: history,
    generationConfig: {
      temperature: 0.45, // lower = more correct + more consistent persona
      topP: 0.9,
      topK: 32,
      maxOutputTokens: 2048,
    },
  };
}

// -----------------------------
// Main send flow
// -----------------------------
async function callGuruji(session, rawUserText) {
  const apiKey = getApiKey();
  if (!apiKey) {
    showToast("API key not set. Open Settings and save it.");
    return;
  }

  if (!navigator.onLine) {
    showToast("You are offline. Message saved locally.");
    return;
  }

  setSendingDisabled(true);
  showTyping(true);

  try {
    // 1) Interpreter rewrite (date + intent)
    const rewritten = await interpretUserQuery(rawUserText, apiKey);

    // 2) Guruji response
    const payload = buildGurujiPayload(session.messages, rewritten);
    const result = await geminiFetch(GURUJI_URL, apiKey, payload, 30000);

    if (!result.ok) {
      console.error("Gemini API error:", result.status, result.text);

      if (result.status === 429) {
        const sec = parseRetryDelaySeconds(result.text);
        if (sec) {
          showToast(`Rate limit. Retry after ${sec}s.`);
          pendingRetry = { sessionId: session.id, lastUserText: rawUserText, retryAtMs: Date.now() + sec * 1000 };
        } else {
          showToast("Rate limit. Please retry in a minute.");
        }
      } else if (result.status === 401 || result.status === 403) {
        showToast("Invalid/unauthorized API key. Update it in Settings.");
      } else if (result.status === 400) {
        showToast("Bad request (payload/model mismatch). Check Console.");
      } else if (result.status === 404) {
        showToast("Model not found for your key. Check model name.");
      } else {
        showToast(`API Error ${result.status || ""}. Check Console.`);
      }

      return;
    }

    let reply = extractTextFromGemini(result.json)?.trim() || "[No response]";

    // 3) Marathi enforcement (if model still replied in English)
    reply = await translateToMarathiIfNeeded(reply, apiKey);

    // Save assistant message
    session.messages.push({ role: "assistant", content: reply, tsISO: nowISO() });
    session.updatedAtISO = nowISO();
    saveSessions();
    renderMessages();

    pendingRetry = null;
  } finally {
    showTyping(false);
    setSendingDisabled(false);
  }
}

// -----------------------------
// User message insertion
// -----------------------------
async function insertUserMessage(rawText) {
  const text = (rawText || "").trim();
  if (!text) return;

  const session = getActiveSession();
  if (!session) return;

  const ts = nowISO();
  session.messages.push({ role: "user", content: text, tsISO: ts });
  session.updatedAtISO = ts;

  if (session.messages.filter((m) => m.role === "user").length === 1) {
    updateSessionTitleFromFirstMessage(session, text);
  }

  saveSessions();
  renderMessages();

  if (messageInput) messageInput.value = "";

  await callGuruji(session, text);
}

// -----------------------------
// Import/Export
// -----------------------------
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function mergeSessions(imported) {
  imported.forEach((s) => {
    if (!s || !s.id || !Array.isArray(s.messages)) return;
    const exists = sessions.some((x) => x.id === s.id);
    const copy = { ...s };
    if (exists) copy.id = crypto.randomUUID();
    sessions.push(copy);
  });

  sessions.sort((a, b) => (b.updatedAtISO || "").localeCompare(a.updatedAtISO || ""));
  saveSessions();
  renderSessionsList();
  renderMessages();
}

// -----------------------------
// Init
// -----------------------------
function init() {
  sessions = loadSessions();
  activeSessionId = localStorage.getItem(STORAGE.ACTIVE_SESSION) || null;

  if (!sessions.length) {
    createNewSession();
  } else if (!activeSessionId || !sessions.some((s) => s.id === activeSessionId)) {
    activeSessionId = sessions[0].id;
    saveSessions();
  }

  renderQuickActions();
  renderSessionsList();
  renderMessages();
  updateLanguageUI();

  // Register SW
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  }

  // Offline banner initial
  if (offlineBanner) offlineBanner.classList.toggle("hidden", navigator.onLine);
}

// -----------------------------
// Events
// -----------------------------
window.addEventListener("online", () => {
  if (offlineBanner) offlineBanner.classList.add("hidden");

  // auto retry if we had a rate-limit delay and it's time
  if (pendingRetry && Date.now() >= pendingRetry.retryAtMs) {
    const s = getActiveSession();
    if (s && pendingRetry.sessionId === s.id) {
      callGuruji(s, pendingRetry.lastUserText);
    }
  }
});

window.addEventListener("offline", () => {
  if (offlineBanner) offlineBanner.classList.remove("hidden");
});

if (langToggle) {
  langToggle.addEventListener("click", () => {
    const cur = getLanguage();
    const next = cur === "mr" ? "en" : "mr";
    localStorage.setItem(STORAGE.LANGUAGE, next);
    updateLanguageUI();

    // UX: start a fresh session when switching language (prevents mixed-context confusion)
    createNewSession(next === "mr" ? "नवीन सल्लामसलत" : "New Consultation");
    showToast(next === "mr" ? "मराठी मोड" : "English mode");
  });
}

if (settingsBtn) {
  settingsBtn.addEventListener("click", () => {
    if (!settingsPanel) return;
    settingsPanel.classList.remove("hidden");

    const key = getApiKey();
    if (apiKeyInput) {
      apiKeyInput.value = "";
      apiKeyInput.placeholder = key ? maskKey(key) : "Enter your API key";
    }
  });
}

if (closeSettingsBtn) {
  closeSettingsBtn.addEventListener("click", () => {
    if (settingsPanel) settingsPanel.classList.add("hidden");
  });
}

if (settingsLang) {
  settingsLang.addEventListener("change", (e) => {
    localStorage.setItem(STORAGE.LANGUAGE, e.target.value);
    updateLanguageUI();

    // same: new session to avoid mixed-language context
    createNewSession(e.target.value === "mr" ? "नवीन सल्लामसलत" : "New Consultation");
    showToast(e.target.value === "mr" ? "मराठी मोड" : "English mode");
  });
}

if (saveApiKeyBtn) {
  saveApiKeyBtn.addEventListener("click", () => {
    const key = (apiKeyInput?.value || "").trim();
    if (!key) {
      showToast("API key cannot be empty");
      return;
    }
    localStorage.setItem(STORAGE.API_KEY, key);
    if (apiKeyInput) {
      apiKeyInput.value = "";
      apiKeyInput.placeholder = maskKey(key);
    }
    showToast("API key saved");
  });
}

if (forgetApiKeyBtn) {
  forgetApiKeyBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE.API_KEY);
    if (apiKeyInput) {
      apiKeyInput.value = "";
      apiKeyInput.placeholder = "Enter your API key";
    }
    showToast("API key removed");
  });
}

if (newSessionBtn) {
  newSessionBtn.addEventListener("click", () => {
    createNewSession(getLanguage() === "mr" ? "नवीन सल्लामसलत" : "New Consultation");
    showToast("New consultation started");
  });
}

if (exportCurrentBtn) {
  exportCurrentBtn.addEventListener("click", () => {
    const session = getActiveSession();
    if (!session) return;
    const name = (session.title || "session").replace(/[^\w\-]+/g, "_");
    downloadJSON(`${name}.json`, session);
    showToast("Current session exported");
  });
}

if (exportAllBtn) {
  exportAllBtn.addEventListener("click", () => {
    downloadJSON("barve_guruji_sessions.json", sessions);
    showToast("All sessions exported");
  });
}

if (importFileInput) {
  importFileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const txt = await file.text();
      const data = safeParseJSON(txt, null);

      if (Array.isArray(data)) {
        mergeSessions(data);
        showToast("Sessions imported");
      } else if (data && data.id) {
        mergeSessions([data]);
        showToast("Session imported");
      } else {
        showToast("Invalid import JSON");
      }
    } catch (err) {
      console.error("Import error:", err);
      showToast("Import failed");
    } finally {
      importFileInput.value = "";
    }
  });
}

if (inputForm) {
  inputForm.addEventListener("submit", (e) => {
    e.preventDefault();
    insertUserMessage(messageInput?.value || "");
  });
}

if (messageInput) {
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      insertUserMessage(messageInput.value);
    }
  });
}

// -----------------------------
// Boot
// -----------------------------
init();
