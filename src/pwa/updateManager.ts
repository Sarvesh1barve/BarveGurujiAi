const APP_BASE = "/BarveGurujiAi/";

export interface UpdateManagerCallbacks {
  onUpdateReady: (activate: () => Promise<void>) => void;
  onRegistered?: (registration: ServiceWorkerRegistration) => void;
}

export async function registerServiceWorker(callbacks: UpdateManagerCallbacks): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return undefined;
  const registration = await navigator.serviceWorker.register(`${APP_BASE}sw.js`, { scope: APP_BASE, updateViaCache: "none" });
  callbacks.onRegistered?.(registration);

  let reloaded = false;
  let updateRequested = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updateRequested || reloaded) return;
    reloaded = true;
    location.reload();
  });

  const presentUpdate = (worker: ServiceWorker) => callbacks.onUpdateReady(async () => {
    updateRequested = true;
    worker.postMessage({ type: "SKIP_WAITING" });
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
      setTimeout(resolve, 5_000);
    });
  });

  if (registration.waiting && navigator.serviceWorker.controller) presentUpdate(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) presentUpdate(worker);
    });
  });
  window.setInterval(() => registration.update().catch(() => undefined), 60 * 60 * 1_000);
  return registration;
}

export async function repairApplication(clearLocalData = false): Promise<void> {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("barve-guruji-")).map((key) => caches.delete(key)));
  const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? [];
  await Promise.all(registrations.filter((registration) => registration.scope.includes(APP_BASE)).map((registration) => registration.unregister()));
  if (clearLocalData) {
    indexedDB.deleteDatabase("barve-guruji-ai");
    localStorage.clear();
    sessionStorage.clear();
  }
  const url = new URL(`${APP_BASE}`, location.origin);
  url.searchParams.set("repair", Date.now().toString());
  location.assign(url);
}

export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => value.split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(a); const right = parse(b);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
