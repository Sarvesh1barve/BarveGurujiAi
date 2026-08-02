import "./styles.css";
import { markStartupComplete, renderFatalStartup } from "./startupFallback";
import type { AppSettings, VerifiedChart, VerifiedContext } from "./types/domain";
import type { ChatMessage, Consultation, StoredAttachment } from "./types/storage";
import { renderAppShell } from "./ui/shell";
import { createId } from "./utils/ids";
import { renderSafeMarkdown } from "./utils/markdown";
import { dateInTimezone, resolveRelativeDate } from "./utils/dateResolution";
import { migrateLegacyStorage } from "./storage/migrations";
import { estimateStorage, getDatabase } from "./storage/database";
import { forgetApiKey, getApiKey, getSettings, hasRememberedApiKey, saveSettings, setApiKey } from "./storage/settingsRepository";
import { clearAllChats, clearMessages, createConsultation, deleteConsultation, deleteMessage, exportConsultations, getConsultation, listConsultations, listMessages, saveConsultation, saveMessage } from "./storage/sessionRepository";
import { addReference, clearAttachments, getAttachment, isSupportedAttachment, listReferences, removeAttachment, saveAttachment, storeAttachment } from "./storage/attachmentRepository";
import { importBackup, validateImport } from "./storage/importValidation";
import { streamGurujiResponse, testGeminiConnection } from "./ai/chatOrchestrator";
import { removeRemoteFile } from "./ai/attachmentService";
import { isSafeModelName } from "./ai/modelConfig";
import { GeminiUserError, retryBackoffMs } from "./ai/responseErrors";
import { extractKundali, type KundaliExtraction, validateKundaliExtraction } from "./ai/kundaliExtraction";
import { calculatePanchang } from "./domain/panchang/panchangEngine";
import { calculateAgniVas } from "./domain/agniVas/calculator";
import { findGeneralMuhurtas, MUHURTA_PURPOSES } from "./domain/muhurta/muhurtaEngine";
import { registerServiceWorker, repairApplication } from "./pwa/updateManager";
import { setupInstallExperience } from "./pwa/installManager";

const ACTIVE_SESSION_KEY = "bg_active_session_v2";
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Application root is missing.");
renderAppShell(root);

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing UI element: ${selector}`);
  return found;
}

const ui = {
  sidebar: element<HTMLElement>("#sidebar"), drawerScrim: element<HTMLButtonElement>("#drawer-scrim"), sessionList: element<HTMLElement>("#session-list"), sessionSearch: element<HTMLInputElement>("#session-search"), activeTitle: element<HTMLElement>("#active-title"),
  feed: element<HTMLElement>("#chat-feed"), list: element<HTMLElement>("#message-list"), empty: element<HTMLElement>("#empty-state"), scrollBottom: element<HTMLButtonElement>("#scroll-bottom"),
  composer: element<HTMLFormElement>("#composer"), input: element<HTMLTextAreaElement>("#message-input"), send: element<HTMLButtonElement>("#send-button"), stop: element<HTMLButtonElement>("#stop-button"), fileInput: element<HTMLInputElement>("#file-input"), attachmentTray: element<HTMLElement>("#attachment-tray"),
  generation: element<HTMLElement>("#generation-status"), generationLabel: element<HTMLElement>("#generation-label"), offline: element<HTMLElement>("#offline-banner"), onlineStatus: element<HTMLElement>("#online-status"),
  settings: element<HTMLDialogElement>("#settings-dialog"), kundali: element<HTMLDialogElement>("#kundali-dialog"), muhurta: element<HTMLDialogElement>("#muhurta-dialog"), library: element<HTMLDialogElement>("#library-dialog"),
  updateBanner: element<HTMLElement>("#update-banner"), toastRegion: element<HTMLElement>("#toast-region"),
};

let settings: AppSettings = getSettings();
let sessions: Consultation[] = [];
let activeSession: Consultation;
let messages: ChatMessage[] = [];
let pendingAttachments: StoredAttachment[] = [];
let activeAbort: AbortController | undefined;
let userScrolledAway = false;
let pendingKundali: { extraction: KundaliExtraction; attachment: StoredAttachment; userMessage: ChatMessage } | undefined;
let idleTimer: number | undefined;
const retryAttempts = new Map<string, number>();

function resetIdleKeyTimer(): void {
  if (idleTimer) window.clearTimeout(idleTimer);
  idleTimer = undefined;
  if (settings.idleKeyMinutes > 0 && getApiKey()) {
    idleTimer = window.setTimeout(() => { forgetApiKey(); toast("Gemini API key removed after the selected idle period."); }, settings.idleKeyMinutes * 60_000);
  }
}

function toast(text: string): void {
  const item = document.createElement("div"); item.className = "toast"; item.textContent = text; ui.toastRegion.append(item);
  window.setTimeout(() => item.remove(), 4_500);
}

function bytes(value: number): string {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"]; const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}

function updateNetworkState(): void {
  ui.offline.hidden = navigator.onLine;
  ui.onlineStatus.classList.toggle("offline", !navigator.onLine);
  ui.onlineStatus.title = navigator.onLine ? "Online" : "Offline";
}

function setGeneration(active: boolean, label = "Guruji is composing"): void {
  ui.generation.hidden = !active; ui.generationLabel.textContent = label; ui.stop.hidden = !active; ui.send.disabled = active; ui.input.disabled = active;
}

function autosize(): void {
  ui.input.style.height = "auto"; ui.input.style.height = `${Math.min(ui.input.scrollHeight, 148)}px`;
}

function nearBottom(): boolean { return ui.feed.scrollHeight - ui.feed.scrollTop - ui.feed.clientHeight < 110; }
function scrollToBottom(force = false): void { if (force || !userScrolledAway) ui.feed.scrollTop = ui.feed.scrollHeight; }

function download(filename: string, content: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function messageAction(label: string, action: string, messageId: string): HTMLButtonElement {
  const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.dataset.action = action; button.dataset.messageId = messageId; return button;
}

function renderMessages(): void {
  ui.list.replaceChildren(); ui.empty.hidden = messages.length > 0;
  for (const message of messages) {
    const row = document.createElement("article"); row.className = `message ${message.role}`; row.dataset.messageId = message.id;
    const card = document.createElement("div"); card.className = "message-card";
    const meta = document.createElement("div"); meta.className = "message-meta";
    const role = document.createElement("span"); role.className = "role-label"; role.textContent = message.role === "user" ? "You" : message.role === "assistant" ? "Barve Guruji" : "Calculated locally";
    const time = document.createElement("time"); time.dateTime = message.createdAt; time.textContent = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt));
    meta.append(role, time);
    if (message.verifiedContext?.sourceType && message.verifiedContext.sourceType !== "none") {
      const chip = document.createElement("span"); chip.className = "source-chip"; chip.textContent = message.verifiedContext.sourceType; meta.append(chip);
    }
    if (message.verifiedContext?.warnings.length) { const chip = document.createElement("span"); chip.className = "source-chip warning-chip"; chip.textContent = `${message.verifiedContext.warnings.length} caution${message.verifiedContext.warnings.length === 1 ? "" : "s"}`; meta.append(chip); }
    const content = document.createElement("div"); content.className = "message-content"; content.innerHTML = renderSafeMarkdown(message.content || (message.status === "streaming" ? "…" : ""));
    card.append(meta, content);
    const actions = document.createElement("div"); actions.className = "message-actions";
    actions.append(messageAction("Copy", "copy", message.id));
    if (message.role === "user") actions.append(messageAction("Edit & resend", "edit", message.id));
    if (message.role === "assistant") actions.append(messageAction("Regenerate", "regenerate", message.id));
    if (message.status === "failed" || message.status === "stopped") actions.append(messageAction("Retry", "retry", message.id));
    actions.append(messageAction("Delete", "delete", message.id));
    card.append(actions); row.append(card); ui.list.append(row);
  }
  scrollToBottom();
}

async function renderSessions(query = ""): Promise<void> {
  sessions = await listConsultations(query); ui.sessionList.replaceChildren();
  for (const session of sessions) {
    const row = document.createElement("div"); row.className = `session-row${session.id === activeSession?.id ? " active" : ""}`;
    const open = document.createElement("button"); open.type = "button"; open.className = "session-open"; open.dataset.sessionId = session.id;
    const title = document.createElement("strong"); title.textContent = session.title;
    const updated = document.createElement("small"); updated.textContent = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(session.updatedAt));
    open.append(title, updated);
    const menu = document.createElement("button"); menu.type = "button"; menu.className = "session-menu"; menu.textContent = "•••"; menu.dataset.sessionMenu = session.id; menu.setAttribute("aria-label", `Actions for ${session.title}`);
    row.append(open, menu); ui.sessionList.append(row);
  }
}

async function activateSession(id: string): Promise<void> {
  const selected = await getConsultation(id); if (!selected) return;
  activeSession = selected; messages = await listMessages(id); localStorage.setItem(ACTIVE_SESSION_KEY, id); ui.activeTitle.textContent = selected.title;
  pendingAttachments = []; renderAttachmentTray(); renderMessages(); await renderSessions(ui.sessionSearch.value); closeDrawer();
}

async function newSession(): Promise<void> {
  const created = await createConsultation(settings.language === "mr" ? "नवीन सल्लामसलत" : "New Consultation"); await activateSession(created.id);
}

function closeDrawer(): void { ui.sidebar.classList.remove("open"); ui.drawerScrim.hidden = true; }
function openDrawer(): void { ui.sidebar.classList.add("open"); ui.drawerScrim.hidden = false; }

function renderAttachmentTray(): void {
  ui.attachmentTray.replaceChildren(); ui.attachmentTray.hidden = pendingAttachments.length === 0;
  for (const attachment of pendingAttachments) {
    const card = document.createElement("div"); card.className = "attachment-card";
    const thumb = document.createElement("div"); thumb.className = "thumb";
    if (attachment.mimeType.startsWith("image/")) { const image = document.createElement("img"); const url = URL.createObjectURL(attachment.blob); image.src = url; image.alt = ""; image.onload = () => URL.revokeObjectURL(url); thumb.append(image); } else thumb.textContent = "PDF";
    const info = document.createElement("div"); const name = document.createElement("strong"); name.textContent = attachment.fileName; const size = document.createElement("small"); size.textContent = `${bytes(attachment.size)} · ${attachment.useMode === "pinned" ? "Pinned" : "This message"}`; info.append(name, size);
    const controls = document.createElement("div");
    const pin = document.createElement("button"); pin.type = "button"; pin.textContent = attachment.useMode === "pinned" ? "Once" : "Pin"; pin.setAttribute("aria-label", `${attachment.useMode === "pinned" ? "Use once" : "Pin to consultation"} ${attachment.fileName}`); pin.dataset.togglePin = attachment.id;
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", `Remove ${attachment.fileName}`); remove.dataset.removeAttachment = attachment.id;
    controls.append(pin, remove); card.append(thumb, info, controls); ui.attachmentTray.append(card);
  }
}

async function acceptFiles(files: File[]): Promise<void> {
  if (!files.length) return;
  if (!settings.uploadNoticeAccepted) {
    const accepted = window.confirm("Privacy notice: The selected file will be sent to Google’s Gemini service for analysis when you send this message. The original is stored locally. Continue?");
    if (!accepted) return;
    settings.uploadNoticeAccepted = true; saveSettings(settings);
  }
  for (const file of files) {
    if (!isSupportedAttachment(file)) { toast(`${file.name}: only JPEG, PNG, WebP and PDF files are supported.`); continue; }
    try { pendingAttachments.push(await storeAttachment(file, activeSession.id)); } catch (error) { toast(error instanceof Error ? error.message : "Attachment could not be stored."); }
  }
  renderAttachmentTray();
}

function buildVerifiedContext(text: string): VerifiedContext {
  const resolved = resolveRelativeDate(text, new Date(), settings.location.timezone);
  const needsPanchang = /panchang|पंचांग|agnivas|agni\s*vas|अग्निवास|muhurta|मुहूर्त/iu.test(text);
  const context = needsPanchang ? calculatePanchang(resolved.date ?? dateInTimezone(new Date(), settings.location.timezone), settings.location) : {
    date: resolved.date, timezone: settings.location.timezone, latitude: settings.location.latitude, longitude: settings.location.longitude,
    locationName: settings.location.name, sourceType: "none" as const, warnings: ["No exact Panchang or chart values were supplied for this general question."],
  };
  if (activeSession.verifiedChart) { context.chart = activeSession.verifiedChart; if (context.sourceType === "none") context.sourceType = "user-confirmed"; }
  return context;
}

async function updateStreamingMessage(message: ChatMessage, append: string): Promise<void> {
  message.content += append; message.updatedAt = new Date().toISOString();
  const node = ui.list.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(message.id)}"] .message-content`);
  if (node) node.innerHTML = renderSafeMarkdown(message.content);
  if (nearBottom()) scrollToBottom();
}

async function generateForUser(userMessage: ChatMessage, context = userMessage.verifiedContext ?? buildVerifiedContext(userMessage.content)): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) { toast("Add your own Gemini API key in Settings. The question remains saved locally."); ui.settings.showModal(); return; }
  const attachmentRecords = (await Promise.all(userMessage.attachmentIds.map(getAttachment))).filter((item): item is StoredAttachment => Boolean(item));
  const pinned = (await Promise.all((await (await getDatabase()).getAllFromIndex("attachments", "by-session", activeSession.id)).filter(({ useMode }) => useMode === "pinned").map(async (item) => item))).filter((item) => !attachmentRecords.some(({ id }) => id === item.id));
  const now = new Date().toISOString();
  const assistant: ChatMessage = { id: createId("message"), sessionId: activeSession.id, role: "assistant", content: "", createdAt: now, updatedAt: now, status: "streaming", attachmentIds: [] };
  messages.push(assistant); renderMessages(); activeAbort = new AbortController(); setGeneration(true);
  try {
    const completed = await streamGurujiResponse({ apiKey, settings, messages: messages.filter(({ id }) => id !== assistant.id), currentUserMessage: userMessage, verifiedContext: context, attachments: [...attachmentRecords, ...pinned], signal: activeAbort.signal, onStatus: (label) => setGeneration(true, label), onText: (text) => { void updateStreamingMessage(assistant, text); } });
    assistant.content = completed; assistant.status = "complete"; assistant.updatedAt = new Date().toISOString(); await saveMessage(assistant);
  } catch (error) {
    const mapped = error instanceof GeminiUserError ? error : new GeminiUserError("unknown", error instanceof Error ? error.message : "Generation failed.");
    assistant.status = mapped.code === "aborted" ? "stopped" : "failed"; assistant.errorCode = mapped.code;
    if (!assistant.content) assistant.content = mapped.message; await saveMessage(assistant); toast(mapped.message);
  } finally { activeAbort = undefined; setGeneration(false); renderMessages(); }
}

async function saveUserMessage(text: string, context?: VerifiedContext): Promise<ChatMessage> {
  const now = new Date().toISOString();
  const message: ChatMessage = { id: createId("message"), sessionId: activeSession.id, role: "user", content: text, createdAt: now, updatedAt: now, status: "complete", attachmentIds: pendingAttachments.map(({ id }) => id), verifiedContext: context };
  for (const attachment of pendingAttachments) await saveAttachment({ ...attachment, messageId: message.id });
  await saveMessage(message); messages.push(message);
  if (messages.filter(({ role }) => role === "user").length === 1) { activeSession.title = text.slice(0, 72) || activeSession.title; await saveConsultation(activeSession); ui.activeTitle.textContent = activeSession.title; }
  pendingAttachments = []; renderAttachmentTray(); renderMessages(); await renderSessions(ui.sessionSearch.value); return message;
}

function isKundaliRequest(text: string): boolean { return /kundali|कुंडली|horoscope\s+chart|जन्मपत्रिका/iu.test(text); }

async function submitMessage(raw: string): Promise<void> {
  const text = raw.trim(); if (!text || activeAbort) return;
  const context = buildVerifiedContext(text); const attachmentsForTurn = [...pendingAttachments];
  const userMessage = await saveUserMessage(text, context); ui.input.value = ""; autosize();
  if (isKundaliRequest(text) && attachmentsForTurn.length) {
    const apiKey = getApiKey(); if (!apiKey) { toast("Add an API key to extract the Kundali. Prediction has not started."); ui.settings.showModal(); return; }
    activeAbort = new AbortController(); setGeneration(true, "Reading Kundali");
    try {
      const extraction = await extractKundali(apiKey, settings.model, attachmentsForTurn[0] as StoredAttachment, activeAbort.signal, (label) => setGeneration(true, label));
      pendingKundali = { extraction, attachment: attachmentsForTurn[0] as StoredAttachment, userMessage };
      element<HTMLTextAreaElement>("#kundali-json").value = JSON.stringify(extraction, null, 2); element<HTMLElement>("#kundali-error").textContent = ""; ui.kundali.showModal();
    } catch (error) { toast(error instanceof Error ? error.message : "Kundali extraction failed."); }
    finally { activeAbort = undefined; setGeneration(false); }
    return;
  }
  await generateForUser(userMessage, context);
}

function panchangMarkdown(context: VerifiedContext): string {
  const p = context.panchang; if (!p) return "### Panchang unavailable\nThis value is not yet verified in the calculation engine.";
  return `### Local Panchang foundation — ${p.civilDate}\n\n**Location:** ${context.locationName} · **Timezone:** ${context.timezone}\n\n- **Vara:** ${p.vara}\n- **Sunrise:** ${p.sunrise ?? "Unavailable"}\n- **Sunset:** ${p.sunset ?? "Unavailable"}\n- **Tithi at sunrise (provisional):** ${p.tithi?.name ?? "Not yet verified"}${p.tithi?.endsAt ? ` (ends ${p.tithi.endsAt})` : ""}\n- **Nakshatra at sunrise (provisional):** ${p.nakshatra?.name ?? "Not yet verified"}${p.nakshatra?.endsAt ? ` (ends ${p.nakshatra.endsAt})` : ""}\n- **Rahu Kaal:** ${p.rahuKaal ? `${p.rahuKaal.start}–${p.rahuKaal.end}` : "Unavailable"}\n- **Yamaganda:** ${p.yamaganda ? `${p.yamaganda.start}–${p.yamaganda.end}` : "Unavailable"}\n- **Gulika Kaal:** ${p.gulikaKaal ? `${p.gulikaKaal.start}–${p.gulikaKaal.end}` : "Unavailable"}\n- **Abhijit:** ${p.abhijitMuhurta ? `${p.abhijitMuhurta.start}–${p.abhijitMuhurta.end}` : "Unavailable"}\n\n**Status:** ${p.validationStatus}. ${p.unverifiedFields.length ? `This value is not yet verified in the calculation engine. Independent fixture validation remains pending for: ${p.unverifiedFields.join(", ")}.` : "Validated."}\n\n**Method:** ${context.calculationMethod}; **Ayanamsa:** ${context.ayanamsa}.`;
}

async function addCalculation(content: string, context: VerifiedContext): Promise<void> {
  const now = new Date().toISOString(); const message: ChatMessage = { id: createId("message"), sessionId: activeSession.id, role: "calculation", content, createdAt: now, updatedAt: now, status: "complete", attachmentIds: [], verifiedContext: context, evidenceLevel: "A" };
  await saveMessage(message); messages.push(message); renderMessages();
}

async function quickAction(action: string): Promise<void> {
  if (action === "panchang") {
    setGeneration(true, "Calculating Panchang"); const date = dateInTimezone(new Date(), settings.location.timezone); const context = calculatePanchang(date, settings.location); const user = await saveUserMessage(settings.language === "en" ? `Explain today's Panchang for ${date}.` : `आजचे पंचांग (${date}) समजावून सांगा.`, context); await addCalculation(panchangMarkdown(context), context); setGeneration(false); await generateForUser(user, context); return;
  }
  if (action === "agni") {
    setGeneration(true, "Calculating Panchang"); const date = dateInTimezone(new Date(), settings.location.timezone); const context = calculatePanchang(date, settings.location); const tithi = context.panchang?.tithi?.index;
    await saveUserMessage(settings.language === "en" ? "Calculate today's Agni Vas." : "आजचा अग्निवास काढा.", context);
    if (!tithi) await addCalculation("### Agni Vas unavailable\nThe local engine could not supply a tithi. No result has been guessed.", context);
    else { const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() + 1; const result = calculateAgniVas(tithi, weekday); context.agniVas = { method: result.rule.name, methodVersion: result.rule.version, tithiNumber: result.tithiNumber, weekdayNumber: result.weekdayNumber, arithmetic: result.arithmetic, remainder: result.remainder, result: result.location, homaRecommendation: result.homaRecommendation }; await addCalculation(`### Agni Vas — ${result.location}\n\n- **Method:** ${result.rule.name} v${result.rule.version}\n- **Inputs:** Tithi ${result.tithiNumber}; weekday ${result.weekdayNumber} (Sunday=1)\n- **Arithmetic:** ${result.arithmetic}\n- **Homa:** ${result.homaRecommendation === "recommended-under-rule" ? "Recommended under this rule" : "Not recommended under this rule"}\n\n${result.warning}`, context); }
    setGeneration(false); return;
  }
  if (action === "vivah" || action === "muhurta") { ui.muhurta.showModal(); return; }
  if (action === "kundali") { ui.input.value = settings.language === "en" ? "Please extract and analyse this Kundali after I confirm it." : "ही कुंडली प्रथम वाचा; मी माहिती निश्चित केल्यानंतरच विश्लेषण करा."; autosize(); ui.fileInput.click(); return; }
  const prompts: Record<string, string> = { satyanarayan: "सत्यनारायण पूजेचा साधा क्रम, आवश्यक साहित्य आणि प्रादेशिक फरक समजावून सांगा.", ritual: "महाराष्ट्रीय विधी आणि कुटुंबपरंपरा यांतील फरक कसा समजून घ्यावा?", shastra: "श्रुती, स्मृती, इतिहास आणि पुराण यांतील फरक सोप्या भाषेत समजावून सांगा." };
  if (prompts[action]) await submitMessage(prompts[action]);
}

async function handleMessageAction(button: HTMLButtonElement): Promise<void> {
  const id = button.dataset.messageId; const action = button.dataset.action; if (!id || !action) return;
  const message = messages.find((item) => item.id === id); if (!message) return;
  if (action === "copy") { await navigator.clipboard.writeText(message.content); toast("Copied."); return; }
  if (action === "delete") { if (!window.confirm("Delete this message?")) return; await deleteMessage(id); messages = messages.filter((item) => item.id !== id); renderMessages(); return; }
  if (action === "edit") {
    const edited = window.prompt("Edit question and resend", message.content)?.trim(); if (!edited) return;
    const index = messages.findIndex((item) => item.id === id); const next = messages[index + 1]; if (next?.role === "assistant") { await deleteMessage(next.id); messages.splice(index + 1, 1); }
    message.content = edited; message.updatedAt = new Date().toISOString(); message.verifiedContext = buildVerifiedContext(edited); await saveMessage(message); renderMessages(); await generateForUser(message); return;
  }
  if (action === "regenerate" || action === "retry") {
    const index = messages.findIndex((item) => item.id === id); const user = message.role === "user" ? message : [...messages.slice(0, index)].reverse().find((item) => item.role === "user"); if (!user) return;
    if (message.role === "assistant") { await deleteMessage(message.id); messages = messages.filter((item) => item.id !== message.id); }
    if (action === "retry" && (message.errorCode === "quota" || message.errorCode === "temporary")) { const attempt = retryAttempts.get(user.id) ?? 0; retryAttempts.set(user.id, attempt + 1); const delay = retryBackoffMs(attempt, () => 0); setGeneration(true, `Retrying in ${Math.ceil(delay / 1_000)}s`); await new Promise((resolve) => window.setTimeout(resolve, delay)); setGeneration(false); }
    await generateForUser(user); return;
  }
}

async function populateSettings(): Promise<void> {
  settings = getSettings(); element<HTMLInputElement>("#api-key").value = ""; element<HTMLInputElement>("#remember-key").checked = hasRememberedApiKey(); element<HTMLElement>("#remember-warning").hidden = !hasRememberedApiKey();
  element<HTMLSelectElement>("#idle-key").value = String(settings.idleKeyMinutes);
  element<HTMLInputElement>("#model-setting").value = settings.model; element<HTMLSelectElement>("#language-setting").value = settings.language; element<HTMLInputElement>("#location-name").value = settings.location.name; element<HTMLInputElement>("#latitude").value = String(settings.location.latitude); element<HTMLInputElement>("#longitude").value = String(settings.location.longitude); element<HTMLInputElement>("#timezone").value = settings.location.timezone;
  element<HTMLElement>("#app-version").textContent = __APP_VERSION__; element<HTMLElement>("#build-time").textContent = new Date(__BUILD_TIME__).toLocaleString();
  const usage = await estimateStorage(); element<HTMLElement>("#storage-usage").textContent = usage.quota ? `${bytes(usage.used)} used of about ${bytes(usage.quota)} available.` : `${bytes(usage.used)} stored locally.`;
}

async function renderLibrary(): Promise<void> {
  const container = element<HTMLElement>("#library-list"); container.replaceChildren(); const references = await listReferences();
  if (!references.length) { const empty = document.createElement("p"); empty.className = "fine-print"; empty.textContent = "No local references yet."; container.append(empty); return; }
  for (const reference of references) { const row = document.createElement("div"); row.className = "library-row"; const text = document.createElement("span"); text.textContent = `${reference.title} · ${reference.kind}`; const use = document.createElement("button"); use.className = "button button-small"; use.textContent = "Attach"; use.dataset.libraryAttachment = reference.attachmentId; row.append(text, use); container.append(row); }
}

async function initialise(): Promise<void> {
  const migration = await migrateLegacyStorage(); sessions = await listConsultations();
  const preferred = localStorage.getItem(ACTIVE_SESSION_KEY) ?? migration.activeSessionId;
  if (!sessions.length) await newSession(); else await activateSession(sessions.some(({ id }) => id === preferred) ? preferred as string : (sessions[0] as Consultation).id);
  updateNetworkState(); await populateSettings();
  resetIdleKeyTimer();
  const purpose = element<HTMLSelectElement>("#muhurta-purpose"); for (const item of MUHURTA_PURPOSES) { const option = document.createElement("option"); option.value = item; option.textContent = item; purpose.append(option); }
  const today = dateInTimezone(new Date(), settings.location.timezone); element<HTMLInputElement>("#muhurta-start").value = today; const end = new Date(`${today}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 30); element<HTMLInputElement>("#muhurta-end").value = end.toISOString().slice(0, 10);
  const install = setupInstallExperience(() => { element<HTMLButtonElement>("#install-button").hidden = false; });
  element<HTMLButtonElement>("#install-button").addEventListener("click", async () => { if (install.isIos && !install.canPrompt()) toast("On iPhone/iPad: Share → Add to Home Screen."); else if (await install.prompt()) toast("Installation accepted."); else toast("Use your browser menu to install this app."); });
  if (install.isStandalone) element<HTMLButtonElement>("#install-button").hidden = true;
  await registerServiceWorker({ onUpdateReady: (activate) => { ui.updateBanner.hidden = false; element<HTMLButtonElement>("#update-now").onclick = () => void activate(); } }).catch(() => toast("Offline support could not be registered in this browser."));
  const action = new URLSearchParams(location.search).get("action"); if (action === "panchang") void quickAction("panchang"); else if (action === "new") void newSession();
}

window.addEventListener("online", updateNetworkState); window.addEventListener("offline", updateNetworkState);
element("#menu-button").addEventListener("click", openDrawer); ui.drawerScrim.addEventListener("click", closeDrawer);
element("#new-session").addEventListener("click", () => void newSession());
element("#settings-button").addEventListener("click", () => { void populateSettings(); ui.settings.showModal(); }); element("#open-settings-sidebar").addEventListener("click", () => { void populateSettings(); ui.settings.showModal(); });
element("#setup-location").addEventListener("click", () => { void populateSettings(); ui.settings.showModal(); element<HTMLInputElement>("#location-name").focus(); });
element("#library-button").addEventListener("click", () => { void renderLibrary(); ui.library.showModal(); });
ui.sessionSearch.addEventListener("input", () => void renderSessions(ui.sessionSearch.value));
ui.sessionList.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement; const open = target.closest<HTMLButtonElement>("[data-session-id]"); if (open?.dataset.sessionId) { await activateSession(open.dataset.sessionId); return; }
  const menu = target.closest<HTMLButtonElement>("[data-session-menu]"); const id = menu?.dataset.sessionMenu; if (!id) return; const session = await getConsultation(id); if (!session) return;
  const choice = window.prompt("Type R to rename, C to clear messages, or D to delete this consultation.", "R")?.toLocaleUpperCase();
  if (choice === "R") { const title = window.prompt("Rename consultation", session.title)?.trim(); if (title) { session.title = title.slice(0, 160); await saveConsultation(session); if (session.id === activeSession.id) { activeSession = session; ui.activeTitle.textContent = session.title; } await renderSessions(ui.sessionSearch.value); } }
  if (choice === "C" && window.confirm(`Clear every message in “${session.title}”?`)) { await clearMessages(session.id); if (session.id === activeSession.id) { messages = []; renderMessages(); } toast("Consultation cleared."); }
  if (choice === "D" && window.confirm(`Delete “${session.title}” and its local attachments?`)) { await deleteConsultation(session.id); if (session.id === activeSession.id) { const remaining = await listConsultations(); if (remaining[0]) await activateSession(remaining[0].id); else await newSession(); } else await renderSessions(ui.sessionSearch.value); }
});
ui.composer.addEventListener("submit", (event) => { event.preventDefault(); void submitMessage(ui.input.value); });
ui.input.addEventListener("input", autosize); ui.input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitMessage(ui.input.value); } });
element("#attach-button").addEventListener("click", () => ui.fileInput.click()); ui.fileInput.addEventListener("change", () => { void acceptFiles(Array.from(ui.fileInput.files ?? [])); ui.fileInput.value = ""; });
ui.attachmentTray.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const pinId = target.closest<HTMLButtonElement>("[data-toggle-pin]")?.dataset.togglePin;
  if (pinId) { const attachment = pendingAttachments.find(({ id }) => id === pinId); if (!attachment) return; attachment.useMode = attachment.useMode === "pinned" ? "message" : "pinned"; await saveAttachment(attachment); renderAttachmentTray(); return; }
  const id = target.closest<HTMLButtonElement>("[data-remove-attachment]")?.dataset.removeAttachment; if (!id) return; const attachment = pendingAttachments.find((item) => item.id === id); pendingAttachments = pendingAttachments.filter((item) => item.id !== id); if (attachment && getApiKey()) await removeRemoteFile(getApiKey(), attachment); await removeAttachment(id); renderAttachmentTray();
});
ui.composer.addEventListener("dragover", (event) => { event.preventDefault(); }); ui.composer.addEventListener("drop", (event) => { event.preventDefault(); void acceptFiles(Array.from(event.dataTransfer?.files ?? [])); });
ui.input.addEventListener("paste", (event) => { const files = Array.from(event.clipboardData?.items ?? []).filter((item) => item.kind === "file").map((item) => item.getAsFile()).filter((file): file is File => Boolean(file)); if (files.length) { event.preventDefault(); void acceptFiles(files); } });
ui.stop.addEventListener("click", () => activeAbort?.abort());
ui.feed.addEventListener("scroll", () => { userScrolledAway = !nearBottom(); ui.scrollBottom.hidden = !userScrolledAway; }); ui.scrollBottom.addEventListener("click", () => { userScrolledAway = false; scrollToBottom(true); });
ui.list.addEventListener("click", (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]"); if (button) void handleMessageAction(button); });
document.querySelectorAll<HTMLButtonElement>("[data-quick]").forEach((button) => button.addEventListener("click", () => void quickAction(button.dataset.quick ?? "")));
document.querySelectorAll<HTMLButtonElement>("[data-example]").forEach((button) => button.addEventListener("click", () => void submitMessage(button.dataset.example ?? "")));

element<HTMLInputElement>("#remember-key").addEventListener("change", (event) => { element<HTMLElement>("#remember-warning").hidden = !(event.target as HTMLInputElement).checked; });
element("#save-key").addEventListener("click", () => { const key = element<HTMLInputElement>("#api-key").value.trim(); if (!key) { toast("Enter an API key first."); return; } const remember = element<HTMLInputElement>("#remember-key").checked; if (remember && !window.confirm("Remembering the key uses localStorage. Scripts on this origin can access it. Continue?")) return; setApiKey(key, remember); resetIdleKeyTimer(); element<HTMLInputElement>("#api-key").value = ""; element<HTMLElement>("#key-status").textContent = remember ? "Key remembered on this device." : "Key stored for this browser session only."; });
element("#forget-key").addEventListener("click", () => { forgetApiKey(); element<HTMLElement>("#key-status").textContent = "API key removed."; toast("API key forgotten."); });
element("#test-key").addEventListener("click", async () => { const key = element<HTMLInputElement>("#api-key").value.trim() || getApiKey(); const status = element<HTMLElement>("#key-status"); if (!key) { status.textContent = "Enter or save a key first."; return; } status.textContent = "Testing…"; try { await testGeminiConnection(key, element<HTMLInputElement>("#model-setting").value.trim()); status.textContent = "Connection successful."; } catch (error) { status.textContent = error instanceof Error ? error.message : "Connection failed."; } });
element("#save-settings").addEventListener("click", () => { const model = element<HTMLInputElement>("#model-setting").value.trim(); if (!isSafeModelName(model)) { toast("Use a fixed Gemini model name; “latest” aliases are not allowed."); return; } const latitude = Number(element<HTMLInputElement>("#latitude").value); const longitude = Number(element<HTMLInputElement>("#longitude").value); const timezone = element<HTMLInputElement>("#timezone").value.trim(); try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { toast("Enter a valid IANA timezone such as Asia/Kolkata."); return; } if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) { toast("Latitude or longitude is outside its valid range."); return; } settings = { ...settings, language: element<HTMLSelectElement>("#language-setting").value as AppSettings["language"], model, idleKeyMinutes: Number(element<HTMLSelectElement>("#idle-key").value), location: { name: element<HTMLInputElement>("#location-name").value.trim() || "Selected location", latitude, longitude, timezone, isDefault: false } }; saveSettings(settings); resetIdleKeyTimer(); toast("Settings saved. This consultation was preserved."); });
element("#use-location").addEventListener("click", () => { if (!navigator.geolocation) { toast("Geolocation is unavailable in this browser."); return; } navigator.geolocation.getCurrentPosition((position) => { element<HTMLInputElement>("#latitude").value = position.coords.latitude.toFixed(5); element<HTMLInputElement>("#longitude").value = position.coords.longitude.toFixed(5); element<HTMLInputElement>("#location-name").value = "Browser location"; element<HTMLInputElement>("#timezone").value = Intl.DateTimeFormat().resolvedOptions().timeZone; }, () => toast("Location permission was not granted."), { enableHighAccuracy: false, timeout: 10_000 }); });
element("#export-current").addEventListener("click", async () => { const bundle = await exportConsultations(activeSession.id); download(`barve-guruji-${activeSession.id}.json`, JSON.stringify(bundle, null, 2)); }); element("#export-all").addEventListener("click", async () => download("barve-guruji-backup.json", JSON.stringify(await exportConsultations(), null, 2)));
element<HTMLInputElement>("#import-backup").addEventListener("change", async (event) => { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; try { const bundle = validateImport(JSON.parse(await file.text()) as unknown); const count = await importBackup(bundle); toast(`${count} consultation${count === 1 ? "" : "s"} imported.`); await renderSessions(); } catch (error) { toast(error instanceof Error ? error.message : "Backup import failed."); } input.value = ""; });
element("#clear-chats").addEventListener("click", async () => { if (!window.confirm("Clear all consultations? Attachment originals are kept unless cleared separately.")) return; await clearAllChats(); await newSession(); toast("Chats cleared."); }); element("#clear-attachments").addEventListener("click", async () => { if (!window.confirm("Clear all local attachment and reference blobs? Chat text is preserved.")) return; await clearAttachments(); pendingAttachments = []; renderAttachmentTray(); toast("Attachments cleared."); });
element("#repair-button").addEventListener("click", async () => { const clear = element<HTMLInputElement>("#repair-clear-data").checked; const wording = clear ? "This will permanently clear chats, settings, attachments and the API key, then repair the app. Continue?" : "Repair stale application files? Chats, attachments, settings and the API key will be preserved."; if (window.confirm(wording)) await repairApplication(clear); });

element("#cancel-kundali").addEventListener("click", () => { pendingKundali = undefined; ui.kundali.close(); toast("Chart not confirmed; no prediction was generated."); });
element("#confirm-kundali").addEventListener("click", async () => { if (!pendingKundali) return; const errorNode = element<HTMLElement>("#kundali-error"); try { const parsed = JSON.parse(element<HTMLTextAreaElement>("#kundali-json").value) as unknown; if (!validateKundaliExtraction(parsed)) throw new Error("The corrected chart does not match the required structure or confidence ranges."); const verified: VerifiedChart = { chartStyle: parsed.chartStyle, lagna: parsed.lagna ?? undefined, moonSign: parsed.moonSign ?? undefined, placements: parsed.placements.map((item) => ({ planet: item.planet, house: item.house ?? undefined, sign: item.sign ?? undefined, confidence: item.confidence, notes: item.notes ?? undefined })), dashaText: parsed.dashaText ?? undefined, annotations: parsed.annotations, confirmedAt: new Date().toISOString(), sourceAttachmentId: pendingKundali.attachment.id, sourceName: pendingKundali.attachment.fileName }; activeSession.verifiedChart = verified; await saveConsultation(activeSession); const context = pendingKundali.userMessage.verifiedContext ?? buildVerifiedContext(pendingKundali.userMessage.content); context.chart = verified; context.sourceType = "user-confirmed"; context.sourceName = pendingKundali.attachment.fileName; context.warnings.push(...parsed.ambiguities.map((item) => `${item.field}: ${item.reason}${item.page ? ` (page ${item.page})` : " — Page reference uncertain"}`)); pendingKundali.userMessage.verifiedContext = context; await saveMessage(pendingKundali.userMessage); await addCalculation(`### Confirmed Kundali extraction\n\n- **Source:** ${verified.sourceName}\n- **Chart style:** ${verified.chartStyle}\n- **Lagna:** ${verified.lagna ?? "Not confirmed"}\n- **Chandra Rashi:** ${verified.moonSign ?? "Not confirmed"}\n- **Placements confirmed:** ${verified.placements.length}\n\nThis chart is now user-confirmed. Rashi means the confirmed Moon placement; unclear Dasha data will not be approximated.`, context); const user = pendingKundali.userMessage; pendingKundali = undefined; ui.kundali.close(); await generateForUser(user, context); } catch (error) { errorNode.textContent = error instanceof Error ? error.message : "Could not confirm this extraction."; } });

element("#find-muhurta").addEventListener("click", () => { const request = { purpose: element<HTMLSelectElement>("#muhurta-purpose").value as typeof MUHURTA_PURPOSES[number], location: settings.location, startDate: element<HTMLInputElement>("#muhurta-start").value, endDate: element<HTMLInputElement>("#muhurta-end").value, preferredTime: element<HTMLInputElement>("#muhurta-time").value, personalised: element<HTMLInputElement>("#muhurta-personal").checked }; const result = findGeneralMuhurtas(request); const panel = element<HTMLElement>("#muhurta-results"); panel.replaceChildren(); const title = document.createElement("strong"); title.textContent = "General guidance only — no dates generated"; const list = document.createElement("ul"); for (const warning of result.warnings) { const item = document.createElement("li"); item.textContent = warning; list.append(item); } panel.append(title, list); });
element<HTMLInputElement>("#library-input").addEventListener("change", async (event) => { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; try { const attachment = await storeAttachment(file, activeSession.id, "library"); const title = window.prompt("Reference title", file.name)?.trim() || file.name; await addReference(attachment, title, file.type === "application/pdf" ? "shastra" : "other"); await renderLibrary(); toast("Reference stored locally."); } catch (error) { toast(error instanceof Error ? error.message : "Reference could not be stored."); } input.value = ""; });
element("#library-list").addEventListener("click", async (event) => { const id = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-library-attachment]")?.dataset.libraryAttachment; if (!id) return; const attachment = await getAttachment(id); if (!attachment) return; pendingAttachments.push({ ...attachment, useMode: "message" }); renderAttachmentTray(); ui.library.close(); toast("Reference attached for this message. It has not been sent yet."); });

window.addEventListener("pointerdown", resetIdleKeyTimer, { passive: true });
window.addEventListener("keydown", resetIdleKeyTimer);

void initialise().then(markStartupComplete).catch(renderFatalStartup);
