// app.js
// Main logic for Barve Guruji AI PWA

// Storage keys
const STORAGE = {
  API_KEY: 'bg_api_key',
  LANGUAGE: 'bg_language',
  SESSIONS: 'bg_sessions',
  ACTIVE_SESSION: 'bg_active_session_id'
};

const DEFAULT_LANGUAGE = 'mr';
const MAX_HISTORY = 12;

// Persona system prompt
const SYSTEM_PROMPT = `Role: You are Barve Guruji (बर्वे गुरुजी), an 85-year-old Vedic Astrologer (Jyotish Ratna) and spiritual guide based in Sadashiv Peth, Pune, Maharashtra.

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

Use Bullet points for lists.`;

// Helpers to access DOM
const $ = (sel) => document.querySelector(sel);
const offlineBanner = $('#offlineBanner');
const quickActionsDiv = $('#quickActions');
const chatArea = $('#chatArea');
const messageInput = $('#messageInput');
const sendBtn = $('#sendBtn');
const typingIndicator = $('#typingIndicator');
const settingsPanel = $('#settingsPanel');
const settingsBtn = $('#settingsBtn');
const langToggle = $('#langToggle');
const langLabel = $('#langLabel');
const settingsLang = $('#settingsLang');
const apiKeyInput = $('#apiKeyInput');
const saveApiKeyBtn = $('#saveApiKey');
const forgetApiKeyBtn = $('#forgetApiKey');
const sessionsListDiv = $('#sessionsList');
const newSessionBtn = $('#newSessionBtn');
const exportCurrentBtn = $('#exportCurrentBtn');
const exportAllBtn = $('#exportAllBtn');
const importFileInput = $('#importFileInput');
const closeSettingsBtn = $('#closeSettings');

// Global state
let sessions = [];
let activeSessionId = null;
let pendingUserContent = null; // for retry logic

// Utility: show temporary toast
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-5 left-1/2 transform -translate-x-1/2 bg-maroon text-cream px-4 py-2 rounded shadow-lg text-sm z-50';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Load sessions from localStorage
function loadSessions() {
  try {
    const str = localStorage.getItem(STORAGE.SESSIONS);
    return str ? JSON.parse(str) : [];
  } catch (e) {
    console.warn('Failed to parse sessions', e);
    return [];
  }
}

// Save sessions to localStorage
function saveSessions() {
  localStorage.setItem(STORAGE.SESSIONS, JSON.stringify(sessions));
  localStorage.setItem(STORAGE.ACTIVE_SESSION, activeSessionId || '');
}

// Get active session object
function getActiveSession() {
  return sessions.find((s) => s.id === activeSessionId);
}

// Create a new consultation session
function createNewSession(title = '') {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const session = {
    id,
    title: title || 'New Consultation',
    createdAtISO: now,
    updatedAtISO: now,
    messages: []
  };
  sessions.unshift(session);
  activeSessionId = id;
  saveSessions();
  renderSessionsList();
  renderMessages();
  return session;
}

// Update session title when first message is sent
function updateSessionTitle(session, firstMessage) {
  if (session.messages.length === 1) {
    // Use first 30 chars as title
    session.title = firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '…' : '');
  }
}

// Format date for prompts (YYYY-MM-DD)
function formatDateForPrompt(date) {
  // Use ISO format date but not time
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Render quick action buttons
function renderQuickActions() {
  const dateStr = formatDateForPrompt(new Date());
  const actions = [
    {
      id: 'panchang',
      label: "Today's Panchang",
      prompt: () => `Give today's Panchang for ${dateStr} as per Ruikar and Date Panchang. Mention tithi, nakshatra, yoga, karan, rahukaal, and a clear Shubha/Ashubha verdict.`
    },
    {
      id: 'agni',
      label: 'Agni Vas Check',
      prompt: () => `Calculate Agni Vas for today ${dateStr}. Is it on Prithvi? Can I do Havan? Be strict.`
    },
    {
      id: 'vivah',
      label: 'Vivah Muhurta',
      prompt: () => `List Vivah Muhurtas for the next 3 months based on Date Panchang. Highlight days to avoid due to Guru/Shukra Ast.`
    },
    {
      id: 'satyanarayan',
      label: 'Satyanarayan Dates',
      prompt: () => `List upcoming Purnima and Sankashti Chaturthi dates suitable for Satyanarayan Pooja.`
    },
    {
      id: 'shanti',
      label: 'Shanti Muhurta',
      prompt: () => `Suggest Shanti Muhurtas in next 30 days for Graha Shanti and home puja. Mention days to avoid and give simple upay.`
    },
    {
      id: 'new',
      label: 'New Consultation',
      prompt: null
    }
  ];
  quickActionsDiv.innerHTML = '';
  actions.forEach((action) => {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.className = 'flex-none bg-saffron text-maroon px-3 py-1 rounded whitespace-nowrap hover:bg-maroon hover:text-cream transition focus:outline-none focus:ring-2 focus:ring-cream';
    btn.addEventListener('click', () => {
      if (action.id === 'new') {
        createNewSession();
        showToast('New consultation started');
        return;
      }
      const prompt = action.prompt();
      insertUserMessage(prompt);
    });
    quickActionsDiv.appendChild(btn);
  });
}

// Render messages for active session
function renderMessages() {
  chatArea.innerHTML = '';
  const session = getActiveSession();
  if (!session) return;
  session.messages.forEach((msg) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex';
    const bubble = document.createElement('div');
    bubble.classList.add('max-w-[80%]', 'px-4', 'py-2', 'rounded-lg', 'shadow');
    bubble.style.wordBreak = 'break-word';
    if (msg.role === 'user') {
      wrapper.classList.add('justify-end');
      bubble.classList.add('bg-saffron', 'text-maroon', 'self-end');
    } else {
      wrapper.classList.add('justify-start');
      bubble.classList.add('bg-maroon', 'bg-opacity-10', 'text-maroon');
    }
    // Convert Markdown-like bold markers produced by Gemini into HTML strong tags
    const safeText = msg.content
      .replace(/\n/g, '<br/>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    bubble.innerHTML = safeText;
    wrapper.appendChild(bubble);
    chatArea.appendChild(wrapper);
  });
  // auto scroll to bottom
  chatArea.scrollTop = chatArea.scrollHeight;
}

// Render sessions list in settings panel
function renderSessionsList() {
  sessionsListDiv.innerHTML = '';
  sessions.forEach((session) => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between border border-maroon rounded p-2';
    const openBtn = document.createElement('button');
    openBtn.className = 'flex-1 text-left truncate hover:underline';
    openBtn.textContent = session.title;
    openBtn.title = new Date(session.updatedAtISO).toLocaleString();
    openBtn.addEventListener('click', () => {
      activeSessionId = session.id;
      saveSessions();
      renderMessages();
      renderSessionsList();
      settingsPanel.classList.add('hidden');
    });
    const renameBtn = document.createElement('button');
    renameBtn.className = 'ml-2 text-xs bg-saffron text-maroon px-2 py-1 rounded hover:bg-maroon hover:text-cream transition';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () => {
      const newName = prompt('Rename consultation', session.title);
      if (newName) {
        session.title = newName;
        session.updatedAtISO = new Date().toISOString();
        saveSessions();
        renderSessionsList();
      }
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ml-2 text-xs bg-maroon text-cream px-2 py-1 rounded hover:bg-saffron hover:text-maroon transition';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      if (confirm('Delete this consultation?')) {
        sessions = sessions.filter((s) => s.id !== session.id);
        if (activeSessionId === session.id) {
          // If active session removed, pick another or create new
          if (sessions.length) {
            activeSessionId = sessions[0].id;
          } else {
            createNewSession();
          }
        }
        saveSessions();
        renderSessionsList();
        renderMessages();
      }
    });
    row.appendChild(openBtn);
    row.appendChild(renameBtn);
    row.appendChild(deleteBtn);
    sessionsListDiv.appendChild(row);
  });
}

// Build payload for Gemini API
function buildPayload(messages) {
  // Take last MAX_HISTORY messages for context
  const lastMsgs = messages.slice(-MAX_HISTORY);
  const contents = lastMsgs.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));
  return {
    contents,
    systemInstruction: {
      role: 'system',
      parts: [{ text: SYSTEM_PROMPT }]
    },
    // generationConfig can be tuned; here we keep defaults for natural output
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 1024
    }
  };
}

// Extract assistant response text
function extractAssistantText(data) {
  if (!data || !data.candidates || !data.candidates.length) return '';
  const candidate = data.candidates[0];
  if (!candidate.content || !candidate.content.parts) return '';
  return candidate.content.parts.map((p) => p.text || '').join('');
}

// Handle API errors
function handleError(status) {
  let msg = 'An error occurred';
  if (status === 401 || status === 403) {
    msg = 'Invalid or missing API key';
  } else if (status === 429) {
    msg = 'Rate limit exceeded; please slow down';
  } else if (status >= 500) {
    msg = 'Server error; please try again later';
  }
  showToast(msg);
}

// Send a user message (called by quick actions or form submit)
async function insertUserMessage(content) {
  const text = content.trim();
  if (!text) return;
  const session = getActiveSession();
  if (!session) return;
  const ts = new Date().toISOString();
  session.messages.push({ role: 'user', content: text, tsISO: ts });
  session.updatedAtISO = ts;
  updateSessionTitle(session, text);
  saveSessions();
  renderMessages();
  messageInput.value = '';

  // store for retry
  pendingUserContent = text;
  // If offline, don't call API
  if (!navigator.onLine) {
    showToast('You are offline. Message saved but not sent.');
    return;
  }
  await callGeminiAPI(session);
}

// Call the Gemini API and append assistant response
async function callGeminiAPI(session) {
  const apiKey = localStorage.getItem(STORAGE.API_KEY);
  if (!apiKey) {
    showToast('API key not set. Please enter it in Settings.');
    return;
  }
  showTypingIndicator(true);
  const payload = buildPayload(session.messages);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      handleError(res.status);
      return;
    }
    const data = await res.json();
    const reply = extractAssistantText(data) || '[No response]';
    const ts = new Date().toISOString();
    session.messages.push({ role: 'assistant', content: reply, tsISO: ts });
    session.updatedAtISO = ts;
    saveSessions();
    renderMessages();
    pendingUserContent = null;
  } catch (err) {
    if (err.name === 'AbortError') {
      showToast('Request timed out');
    } else {
      showToast('Error: ' + err.message);
    }
  } finally {
    showTypingIndicator(false);
  }
}

// Show or hide typing indicator
function showTypingIndicator(show) {
  typingIndicator.classList.toggle('hidden', !show);
}

// Update language selection
function updateLanguageUI() {
  const lang = localStorage.getItem(STORAGE.LANGUAGE) || DEFAULT_LANGUAGE;
  langLabel.textContent = lang === 'mr' ? 'मराठी' : 'English';
  settingsLang.value = lang;
}

// Initialize the app
function init() {
  // Load sessions
  sessions = loadSessions();
  activeSessionId = localStorage.getItem(STORAGE.ACTIVE_SESSION);
  if (!sessions.length || !activeSessionId) {
    createNewSession();
  }
  // Render UI
  renderQuickActions();
  renderSessionsList();
  renderMessages();
  updateLanguageUI();
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  }
  // Set offline banner based on current state
  offlineBanner.classList.toggle('hidden', navigator.onLine);
}

// Event listeners
window.addEventListener('online', () => {
  offlineBanner.classList.add('hidden');
  if (pendingUserContent) {
    // attempt to resend
    const session = getActiveSession();
    if (session) {
      callGeminiAPI(session);
    }
  }
});
window.addEventListener('offline', () => {
  offlineBanner.classList.remove('hidden');
});

langToggle.addEventListener('click', () => {
  const current = localStorage.getItem(STORAGE.LANGUAGE) || DEFAULT_LANGUAGE;
  const next = current === 'mr' ? 'en' : 'mr';
  localStorage.setItem(STORAGE.LANGUAGE, next);
  updateLanguageUI();
});

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.remove('hidden');
  // Populate API key field with stored value (masked). We'll not show full key
  const key = localStorage.getItem(STORAGE.API_KEY) || '';
  apiKeyInput.value = key;
});

closeSettingsBtn.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

// Save API key
saveApiKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showToast('API key cannot be empty');
    return;
  }
  localStorage.setItem(STORAGE.API_KEY, key);
  showToast('API key saved');
});

// Forget API key
forgetApiKeyBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE.API_KEY);
  apiKeyInput.value = '';
  showToast('API key removed');
});

// Change language from settings
settingsLang.addEventListener('change', (e) => {
  const lang = e.target.value;
  localStorage.setItem(STORAGE.LANGUAGE, lang);
  updateLanguageUI();
});

// New session from settings panel
newSessionBtn.addEventListener('click', () => {
  createNewSession();
  showToast('New consultation started');
});

// Export current session
exportCurrentBtn.addEventListener('click', () => {
  const session = getActiveSession();
  if (!session) return;
  const dataStr = JSON.stringify(session, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${session.title.replace(/\s+/g, '_') || 'session'}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Current session exported');
});

// Export all sessions
exportAllBtn.addEventListener('click', () => {
  const dataStr = JSON.stringify(sessions, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `barve_guruji_sessions.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('All sessions exported');
});

// Import sessions
importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      // merge array of sessions
      data.forEach((s) => {
      if (!s.id) return;
        // avoid duplicates
        const exists = sessions.some((ex) => ex.id === s.id);
        const newSession = { ...s };
        if (exists) {
          // assign new id to avoid clash
          newSession.id = crypto.randomUUID();
        }
        sessions.push(newSession);
      });
      saveSessions();
      renderSessionsList();
      showToast('Sessions imported');
    } else if (data && data.id) {
      const exists = sessions.some((ex) => ex.id === data.id);
      const imported = { ...data };
      if (exists) imported.id = crypto.randomUUID();
      sessions.push(imported);
      saveSessions();
      renderSessionsList();
      showToast('Session imported');
    } else {
      showToast('Invalid import format');
    }
  } catch (err) {
    showToast('Import failed: ' + err.message);
  } finally {
    importFileInput.value = '';
  }
});

// Form submission (send message)
document.getElementById('inputForm').addEventListener('submit', (e) => {
  e.preventDefault();
  insertUserMessage(messageInput.value);
});

// Enter key handling on textarea
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    insertUserMessage(messageInput.value);
  }
});

// Start the application
init();
