import { repairApplication } from "./pwa/updateManager";

let startupComplete = false;
let fallbackRendered = false;

function technicalDetails(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "An unknown startup error occurred.";
  const safeMessage = message
    .replace(/AIza[\w-]+/gu, "[redacted API key]")
    .replace(/([?&](?:key|api_key|token)=)[^&\s]+/giu, "$1[redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/gu, "[redacted value]")
    .slice(0, 1_000);
  return `${name}: ${safeMessage}`;
}

export function renderFatalStartup(error: unknown): void {
  if (fallbackRendered) return;
  fallbackRendered = true;

  const root = document.querySelector<HTMLElement>("#app");
  if (!root) return;

  const panel = document.createElement("main");
  panel.className = "fatal-startup";
  panel.setAttribute("role", "alert");

  const title = document.createElement("h1");
  title.textContent = "Barve Guruji AI could not start.";
  const message = document.createElement("p");
  message.textContent = "Retry the app. If the problem continues, repair its cached application files; conversations and settings will be preserved.";

  const actions = document.createElement("div");
  actions.className = "fatal-startup-actions";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "button button-primary";
  retry.textContent = "Retry";
  retry.addEventListener("click", () => location.reload());
  const repair = document.createElement("button");
  repair.type = "button";
  repair.className = "button";
  repair.textContent = "Repair app cache";
  repair.addEventListener("click", () => void repairApplication(false));
  actions.append(retry, repair);

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Technical details";
  const code = document.createElement("code");
  code.textContent = technicalDetails(error);
  details.append(summary, code);

  panel.append(title, message, actions, details);
  root.replaceChildren(panel);
}

export function markStartupComplete(): void {
  startupComplete = true;
}

window.addEventListener("error", (event) => {
  if (!startupComplete) renderFatalStartup(event.error ?? new Error(event.message));
});

window.addEventListener("unhandledrejection", (event) => {
  if (!startupComplete) renderFatalStartup(event.reason);
});
