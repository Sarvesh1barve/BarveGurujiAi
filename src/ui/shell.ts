export function renderAppShell(root: HTMLElement): void {
  root.innerHTML = `
    <div class="app-shell">
      <div id="offline-banner" class="network-banner" hidden role="status">Offline — saved consultations and local tools remain available. AI answers need internet.</div>
      <div id="update-banner" class="update-banner" hidden role="status">
        <span>A new version of Barve Guruji AI is available.</span>
        <button id="update-now" class="button button-small">Update now</button>
      </div>

      <aside id="sidebar" class="sidebar" aria-label="Consultations">
        <div class="brand-block">
          <img src="${import.meta.env.BASE_URL}icons/icon.svg" alt="" width="48" height="48" />
          <div><span class="eyebrow">शुभाशीर्वाद</span><strong>Barve Guruji AI</strong></div>
        </div>
        <button id="new-session" class="button button-primary button-wide">＋ New Consultation</button>
        <label class="search-box"><span class="sr-only">Search consultations</span><input id="session-search" type="search" placeholder="Search consultations…" /></label>
        <nav id="session-list" class="session-list"></nav>
        <div class="sidebar-footer"><span>Private on this device</span><button id="open-settings-sidebar" class="icon-button" aria-label="Open settings">⚙</button></div>
      </aside>
      <button id="drawer-scrim" class="drawer-scrim" aria-label="Close consultation drawer" hidden></button>

      <main class="main-panel">
        <header class="topbar">
          <button id="menu-button" class="icon-button mobile-only" aria-label="Open consultations">☰</button>
          <div class="topbar-title"><span class="eyebrow">Virtual Maharashtrian Vedic scholar</span><h1 id="active-title">New Consultation</h1></div>
          <div class="topbar-actions">
            <span id="online-status" class="status-dot" title="Connection status"></span>
            <button id="library-button" class="icon-button" aria-label="Open reference library" title="Reference library">▤</button>
            <button id="settings-button" class="icon-button" aria-label="Open settings">⚙</button>
          </div>
        </header>

        <section class="quick-strip" aria-label="Quick actions">
          <button data-quick="panchang" class="quick-card"><span>☀</span><b>आजचे पंचांग</b><small>Today’s Panchang</small></button>
          <button data-quick="agni" class="quick-card"><span>🔥</span><b>अग्निवास</b><small>Agni Vas</small></button>
          <button data-quick="vivah" class="quick-card"><span>❋</span><b>विवाह मुहूर्त</b><small>General guidance</small></button>
          <button data-quick="muhurta" class="quick-card"><span>◷</span><b>इतर मुहूर्त</b><small>Muhurta Finder</small></button>
          <button data-quick="kundali" class="quick-card"><span>✦</span><b>कुंडली विश्लेषण</b><small>Confirm before analysis</small></button>
          <button data-quick="satyanarayan" class="quick-card"><span>ॐ</span><b>सत्यनारायण पूजा</b><small>Ritual guidance</small></button>
          <button data-quick="ritual" class="quick-card"><span>🪔</span><b>विधी आणि परंपरा</b><small>Traditions</small></button>
          <button data-quick="shastra" class="quick-card"><span>▱</span><b>शास्त्र प्रश्न</b><small>Scripture</small></button>
        </section>

        <section id="chat-feed" class="chat-feed" tabindex="-1" aria-live="polite">
          <div id="empty-state" class="empty-state">
            <div class="mandala">ॐ</div>
            <span class="eyebrow">Begin with clarity</span>
            <h2>नमस्कार. How may Guruji guide you?</h2>
            <p>Ask about a ritual, tradition or Shastra. Exact Panchang facts are calculated locally and clearly labelled.</p>
            <div class="example-grid">
              <button data-example="गृहप्रवेश पूजेचा साधा विधी समजावून सांगा.">गृहप्रवेश पूजेचा साधा विधी</button>
              <button data-example="What does Sankalpa mean in a Puja?">What does Sankalpa mean?</button>
              <button data-example="भगवद्गीतेतील कर्मयोगाचा सोपा अर्थ काय?">कर्मयोगाचा सोपा अर्थ</button>
            </div>
            <button id="setup-location" class="button button-small">Calculation location: Pune (default) · Change</button>
          </div>
          <div id="message-list" class="message-list"></div>
          <button id="scroll-bottom" class="scroll-bottom" hidden aria-label="Scroll to latest message">↓</button>
        </section>

        <section class="composer-wrap">
          <div id="generation-status" class="generation-status" hidden><span class="typing-dots"><i></i><i></i><i></i></span><span id="generation-label">Guruji is composing</span></div>
          <div id="attachment-tray" class="attachment-tray" hidden></div>
          <form id="composer" class="composer">
            <input id="file-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden />
            <input id="camera-input" type="file" accept="image/*" capture="environment" hidden />
            <button id="attach-button" type="button" class="composer-icon" aria-label="Attach image or PDF" title="Attach image or PDF">＋</button>
            <textarea id="message-input" rows="1" maxlength="20000" placeholder="Ask Guruji…" aria-label="Message to Guruji"></textarea>
            <button id="stop-button" type="button" class="button button-danger" hidden>Stop</button>
            <button id="send-button" type="submit" class="send-button" aria-label="Send message">➤</button>
          </form>
          <p class="composer-note">AI interprets; it does not replace a verified Panchang or qualified professional advice.</p>
        </section>
      </main>
    </div>

    <dialog id="settings-dialog" class="modal wide-modal">
      <form method="dialog" class="modal-header"><div><span class="eyebrow">Device & privacy</span><h2>Settings</h2></div><button class="icon-button" aria-label="Close settings">×</button></form>
      <div class="settings-grid">
        <section class="settings-card api-card">
          <h3>Gemini connection</h3>
          <p class="warning-box"><b>Browser key warning:</b> a frontend-only app cannot securely conceal an API key. Scripts on this origin may access a stored key. Use a restricted key and revoke it if needed.</p>
          <label>Gemini API key<input id="api-key" type="password" autocomplete="off" placeholder="Enter your own API key" /></label>
          <label class="checkbox-row"><input id="remember-key" type="checkbox" /> Remember on this device</label>
          <p id="remember-warning" class="fine-print" hidden>Remembering uses localStorage and keeps the key after the browser closes. This is less secure than the default session-only storage.</p>
          <div class="button-row"><button id="save-key" type="button" class="button button-primary">Save key</button><button id="test-key" type="button" class="button">Test connection</button><button id="forget-key" type="button" class="button">Forget</button></div>
          <p id="key-status" class="fine-print" role="status"></p>
          <label>Forget key after inactivity<select id="idle-key"><option value="0">Browser session only</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option></select></label>
          <label>Fixed model<input id="model-setting" type="text" spellcheck="false" /></label>
          <p class="fine-print">Accuracy-sensitive use rejects changing “latest” aliases. Default: gemini-2.5-flash; fallback can be selected manually.</p>
        </section>
        <section class="settings-card">
          <h3>Language & location</h3>
          <label>Response language<select id="language-setting"><option value="mr">मराठी</option><option value="en">English</option><option value="bilingual">Bilingual</option><option value="auto">Auto-detect current message</option></select></label>
          <p class="fine-print">Changing language keeps this consultation and never adds a translation API call.</p>
          <label>City / location name<input id="location-name" type="text" /></label>
          <div class="field-pair"><label>Latitude<input id="latitude" type="number" min="-90" max="90" step="0.0001" /></label><label>Longitude<input id="longitude" type="number" min="-180" max="180" step="0.0001" /></label></div>
          <label>IANA timezone<input id="timezone" type="text" placeholder="Asia/Kolkata" /></label>
          <div class="button-row"><button id="save-settings" type="button" class="button button-primary">Save settings</button><button id="use-location" type="button" class="button">Use my location</button></div>
          <p class="fine-print">Pune is used only as an explicit setup default. Every calculation displays the actual selected location.</p>
        </section>
        <section class="settings-card">
          <h3>Backup & local storage</h3>
          <p id="storage-usage">Calculating storage usage…</p>
          <div class="button-grid"><button id="export-current" type="button" class="button">Export current</button><button id="export-all" type="button" class="button">Export all</button><label class="button file-label">Restore backup<input id="import-backup" type="file" accept="application/json" hidden /></label><button id="clear-chats" type="button" class="button">Clear chats</button><button id="clear-attachments" type="button" class="button">Clear attachments</button></div>
          <p class="fine-print">Backups exclude the API key and attachment blobs. Imported text is validated and sanitised before display.</p>
        </section>
        <section class="settings-card">
          <h3>Install, update & repair</h3>
          <button id="install-button" type="button" class="button button-primary">Install app</button>
          <p id="install-help" class="fine-print">On iPhone/iPad: Share → Add to Home Screen.</p>
          <p>Version <b id="app-version"></b><br /><span class="fine-print">Build <span id="build-time"></span></span></p>
          <p class="fine-print">Repair removes stale app caches and unregisters this app’s service worker. Chats, settings and keys are preserved by default.</p>
          <label class="checkbox-row danger-check"><input id="repair-clear-data" type="checkbox" /> Also clear all local data (irreversible)</label>
          <button id="repair-button" type="button" class="button">Repair / Hard Refresh App</button>
        </section>
        <section class="settings-card privacy-card">
          <h3>Privacy</h3>
          <ul><li>Chats and attachment originals are stored locally on this device.</li><li>Selected prompts and files are sent to Google Gemini for analysis.</li><li>Browser-stored keys can be accessed by scripts on the same origin.</li><li>Clearing browser storage removes local data unless you exported a backup.</li></ul>
        </section>
      </div>
    </dialog>

    <dialog id="kundali-dialog" class="modal">
      <div class="modal-header"><div><span class="eyebrow">Stage 2 — user confirmation</span><h2>I read the chart as follows…</h2></div><button id="cancel-kundali" class="icon-button" aria-label="Cancel Kundali confirmation">×</button></div>
      <p>Correct every uncertain field before confirmation. Prediction will not begin until you confirm this extraction.</p>
      <label>Extracted chart JSON<textarea id="kundali-json" rows="16" spellcheck="false"></textarea></label>
      <p id="kundali-error" class="error-text" role="alert"></p>
      <div class="button-row end"><button id="confirm-kundali" class="button button-primary">Confirm chart</button></div>
    </dialog>

    <dialog id="muhurta-dialog" class="modal">
      <form method="dialog" class="modal-header"><div><span class="eyebrow">Evidence-first finder</span><h2>Muhurta Finder</h2></div><button class="icon-button" aria-label="Close Muhurta finder">×</button></form>
      <div class="field-pair"><label>Purpose<select id="muhurta-purpose"></select></label><label>Preferred time<input id="muhurta-time" type="text" placeholder="Morning" /></label></div>
      <div class="field-pair"><label>From<input id="muhurta-start" type="date" /></label><label>To<input id="muhurta-end" type="date" /></label></div>
      <label class="checkbox-row"><input id="muhurta-personal" type="checkbox" /> Consider confirmed personal birth chart</label>
      <button id="find-muhurta" class="button button-primary">Find verified options</button>
      <div id="muhurta-results" class="result-panel"></div>
    </dialog>

    <dialog id="library-dialog" class="modal">
      <form method="dialog" class="modal-header"><div><span class="eyebrow">Local until selected</span><h2>Reference Library</h2></div><button class="icon-button" aria-label="Close reference library">×</button></form>
      <p>Store Panchang PDFs, family ritual notes, Shastra sources and Kundali reports locally. A file is sent to Gemini only when you attach or pin it to a consultation.</p>
      <label class="button file-label">Add local reference<input id="library-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden /></label>
      <div id="library-list" class="library-list"></div>
    </dialog>

    <div id="toast-region" class="toast-region" aria-live="assertive"></div>
  `;
}
