// app.js
// Barve Guruji AI - Client-side PWA chat using Gemini API (browser only)

const STORAGE = {
  API_KEY: "bg_api_key",
  LANGUAGE: "bg_language",
  SESSIONS: "bg_sessions",
  ACTIVE_SESSION: "bg_active_session_id",
};

const DEFAULT_LANGUAGE = "mr";
const MAX_HISTORY = 12;

// ✅ Persona system prompt (MUST be exact, as requested)
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

// ✅ Gemini API config (use v1beta + header key, as per docs)
const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// DOM helpers
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

let sessions = [];
let activeSessionId = null;

// If user sends while offline, we keep it pending; when online we can retry
let pendingSend = null;

// -----------------------
// Utilities
// -----------------------
function showToast(message) {
  const toast = document.createElement("div");
  toast.className =
    "fixed bottom-5 left-1/2 transform -translate-x-1/2 bg-maroon text-cream px-4 py-2 rounded shadow-lg text-sm z-50";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function nowISO() {
  return new Date().toISOString();
}

function maskKey(key) {
  if (!key) return "";
  if (key.length <= 4) return "••••";
  return "••••••••••••••••" + key.slice(-4);
}

function formatDateForPrompt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function showTyping(show) {
  typingIndicator.classList.toggle("hidden", !show);
}

function setSendingDisabled(disabled) {
  sendBtn.disabled = disabled;
  messageInput.disabled = disabled;
  if (disabled) {
    sendBtn.classList.add("opacity-50", "cursor-not-allowed");
  } else {
    sendBtn.classList.remove("opacity-50", "cursor-not-allowed");
  }
}

// -----------------------
// Storage
// -----------------------
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

// -----------------------
// Sessions
// -----------------------
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
  // only update if session still has default title
  if (session.title === "New Consultation" && firstUserText) {
    session.title =
      firstUserText.slice(0, 30) + (firstUserText.length > 30 ? "…" : "");
  }
}

// -----------------------
// Rendering
// -----------------------
function renderQuickActions() {
  const dateStr = formatDateForPrompt(new Date());

  const actions = [
    {
      id: "panchang",
      label: "Today's Panchang",
      prompt: () =>
        `Give today's Panchang for ${dateStr} as per Ruikar and Date Panchang. Mention tithi, nakshatra, yoga, karan, rahukaal, and a clear Shubha/Ashubha verdict.`,
    },
    {
      id: "agni",
      label: "Agni Vas Check",
      prompt: () =>
        `Calculate Agni Vas for today ${dateStr}. Is it on Prithvi? Can I do Havan? Be strict.`,
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
  chatArea.innerHTML = "";
  const session = getActiveSession();
  if (!session) return;

  session.messages.forEach((msg) => {
    const wrapper = document.createElement("div");
    wrapper.className = "flex";

    const bubble = document.createElement("div");
    bubble.classList.add("max-w-[80%]", "px-4", "py-2", "rounded-lg", "shadow");
    bubble.style.wordBreak = "break-word";

    if (msg.role === "user") {
      wrapper.classList.add("justify-end");
      bubble.classList.add("bg-saffron", "text-maroon", "self-end");
    } else {
      wrapper.classList.add("justify-start");
      bubble.classList.add("bg-maroon", "bg-opacity-10", "text-maroon");
    }

    // Minimal formatting: **bold** and line breaks
    const safe = (msg.content || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    bubble.innerHTML = safe;
    wrapper.appendChild(bubble);
    chatArea.appendChild(wrapper);
  });

  chatArea.scrollTop = chatArea.scrollHeight;
}

function renderSessionsList() {
  sessionsListDiv.innerHTML = "";
  sessions.forEach((s) => {
    const row = document.createElement("div");
    row.className =
      "flex items-center justify-between border border-maroon rounded p-2";

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
      settingsPanel.classList.add("hidden");
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

// -----------------------
// Language
// -----------------------
function getLanguage() {
  return localStorage.getItem(STORAGE.LANGUAGE) || DEFAULT_LANGUAGE;
}

function updateLanguageUI() {
  const lang = getLanguage();
  langLabel.textContent = lang === "mr" ? "मराठी" : "English";
  settingsLang.value = lang;
}

// -----------------------
// Gemini request payload
// -----------------------
// ✅ IMPORTANT: v1beta endpoint doesn't accept "systemInstruction" in your observed setup.
// So we prepend SYSTEM_PROMPT as the first content message.
// This is the most compatible approach.
function buildPayload(sessionMessages) {
  const lastMsgs = sessionMessages.slice(-MAX_HISTORY);

  const lang = getLanguage();
  const langHint =
    lang === "mr"
      ? "Marathi Mode: Respond in pure, formal Pramaan Marathi."
      : "English Mode: Respond in English using Vedic terms (Upay, Grahan, Tithi, etc.).";

  const contents = [];

  // System prompt as first content
  contents.push({
    parts: [
      {
        text:
          SYSTEM_PROMPT +
          "\n\n" +
          "LANGUAGE MODE:\n" +
          langHint +
          "\n\n" +
          "Follow the formatting rules strictly.",
      },
    ],
  });

  // Then conversation messages (we keep as parts-only; v1beta examples allow this)
  lastMsgs.forEach((m) => {
    contents.push({
      parts: [{ text: m.content }],
    });
  });

  return {
    contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 1024,
    },
  };
}

function extractAssistantText(data) {
  // Expected: data.candidates[0].content.parts[].text
  const c0 = data?.candidates?.[0];
  const parts = c0?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => p.text || "").join("");
}

// -----------------------
// Gemini call
// -----------------------
function getApiKey() {
  return (localStorage.getItem(STORAGE.API_KEY) || "").trim();
}

function classifyError(status, bodyText) {
  if (status === 400) return "Bad request (payload / model mismatch)";
  if (status === 401 || status === 403) return "Invalid / unauthorized API key";
  if (status === 429) return "Rate limited. Try again in a bit.";
  if (status >= 500) return "Gemini server error. Try again later.";
  return `HTTP ${status}`;
}

async function callGemini(session) {
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

  const payload = buildPayload(session.messages);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini API error:", res.status, errText);
      showToast(`Gemini Error ${res.status} — check Console`);

      // Keep a retry token
      pendingSend = { sessionId: session.id, whenISO: nowISO() };
      return;
    }

    const data = await res.json();
    const reply = extractAssistantText(data) || "[No response]";

    session.messages.push({
      role: "assistant",
      content: reply,
      tsISO: nowISO(),
    });
    session.updatedAtISO = nowISO();

    saveSessions();
    renderMessages();
    pendingSend = null;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      showToast("Request timed out (30s). Try again.");
    } else {
      showToast("Network error. Check Console.");
      console.error("Network/Fetch error:", err);
    }

    pendingSend = { sessionId: session.id, whenISO: nowISO() };
  } finally {
    showTyping(false);
    setSendingDisabled(false);
  }
}

// -----------------------
// Messaging
// -----------------------
async function insertUserMessage(rawText) {
  const text = (rawText || "").trim();
  if (!text) return;

  const session = getActiveSession();
  if (!session) return;

  const ts = nowISO();
  session.messages.push({ role: "user", content: text, tsISO: ts });
  session.updatedAtISO = ts;

  // auto title on first user message
  if (session.messages.filter((m) => m.role === "user").length === 1) {
    updateSessionTitleFromFirstMessage(session, text);
  }

  saveSessions();
  renderMessages();

  // clear input box
  messageInput.value = "";

  // call gemini
  await callGemini(session);
}

// -----------------------
// Import/Export
// -----------------------
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function mergeSessions(imported) {
  // Merge without data loss: avoid ID collisions
  imported.forEach((s) => {
    if (!s || !s.id || !Array.isArray(s.messages)) return;

    const exists = sessions.some((x) => x.id === s.id);
    const copy = { ...s };

    if (exists) copy.id = crypto.randomUUID();
    sessions.push(copy);
  });

  // sort by updated desc
  sessions.sort((a, b) => (b.updatedAtISO || "").localeCompare(a.updatedAtISO || ""));
  saveSessions();
  renderSessionsList();
}

// -----------------------
// Init
// -----------------------
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

  // register SW
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  }

  // offline banner initial state
  offlineBanner.classList.toggle("hidden", navigator.onLine);
}

// -----------------------
// Event wiring
// -----------------------
window.addEventListener("online", () => {
  offlineBanner.classList.add("hidden");
  // optional retry if last call failed
  if (pendingSend) {
    const s = getActiveSession();
    if (s) callGemini(s);
  }
});

window.addEventListener("offline", () => {
  offlineBanner.classList.remove("hidden");
});

langToggle.addEventListener("click", () => {
  const cur = getLanguage();
  const next = cur === "mr" ? "en" : "mr";
  localStorage.setItem(STORAGE.LANGUAGE, next);
  updateLanguageUI();
  showToast(next === "mr" ? "मराठी मोड" : "English mode");
});

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.remove("hidden");
  const key = getApiKey();
  apiKeyInput.value = key ? key : "";
  if (key) {
    // show masked hint via placeholder to look polished
    apiKeyInput.placeholder = maskKey(key);
  } else {
    apiKeyInput.placeholder = "Enter your API key";
  }
});

closeSettingsBtn.addEventListener("click", () => {
  settingsPanel.classList.add("hidden");
});

settingsLang.addEventListener("change", (e) => {
  localStorage.setItem(STORAGE.LANGUAGE, e.target.value);
  updateLanguageUI();
});

saveApiKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showToast("API key cannot be empty");
    return;
  }
  localStorage.setItem(STORAGE.API_KEY, key);
  apiKeyInput.value = "";
  apiKeyInput.placeholder = maskKey(key);
  showToast("API key saved");
});

forgetApiKeyBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE.API_KEY);
  apiKeyInput.value = "";
  apiKeyInput.placeholder = "Enter your API key";
  showToast("API key removed");
});

newSessionBtn.addEventListener("click", () => {
  createNewSession();
  showToast("New consultation started");
});

exportCurrentBtn.addEventListener("click", () => {
  const session = getActiveSession();
  if (!session) return;
  const name = (session.title || "session").replace(/[^\w\-]+/g, "_");
  downloadJSON(`${name}.json`, session);
  showToast("Current session exported");
});

exportAllBtn.addEventListener("click", () => {
  downloadJSON("barve_guruji_sessions.json", sessions);
  showToast("All sessions exported");
});

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

// Send message on form submit
$("#inputForm").addEventListener("submit", (e) => {
  e.preventDefault();
  insertUserMessage(messageInput.value);
});

// Enter-to-send, Shift+Enter newline
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    insertUserMessage(messageInput.value);
  }
});

// Start
init();


