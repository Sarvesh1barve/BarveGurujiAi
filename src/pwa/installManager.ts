export interface InstallExperience {
  canPrompt: () => boolean;
  prompt: () => Promise<boolean>;
  isIos: boolean;
  isStandalone: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function setupInstallExperience(onAvailable: () => void): InstallExperience {
  let deferred: BeforeInstallPromptEvent | undefined;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    onAvailable();
  });
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return {
    canPrompt: () => Boolean(deferred),
    prompt: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = undefined;
      return choice.outcome === "accepted";
    },
    isIos,
    isStandalone,
  };
}
