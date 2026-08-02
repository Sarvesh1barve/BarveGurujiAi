# Privacy and key handling

Barve Guruji AI is a static browser application. There is no Barve Guruji server or user database.

## Local data

Consultations, messages, attachment blobs, chart confirmations, reference documents and calculation cache are stored in IndexedDB on the current origin/device. Small UI settings use localStorage. Closing or uninstalling the PWA does not necessarily clear browser storage; clearing site data does.

Exports omit API keys and attachment blobs. Users should export a backup before clearing browser/site storage. Compact JSON backup is not a full media archive.

## Gemini requests

The user’s selected prompt, verified context and selected/pinned attachments are sent directly from the browser to Google’s Gemini service with the user’s API key. Reference Library files stay local until explicitly attached. Gemini API privacy and retention terms apply to those requests.

Normal chat sends one generation request per turn. Kundali extraction is a separate, explicit structured operation. The application does not send telemetry, analytics or console logs containing API keys, birth details or attachment contents in production.

## API-key warning

A frontend-only application cannot make a key secret. Default key storage is sessionStorage. Optional device remembering uses localStorage only after a warning. Any script executing on the same origin may read these stores, so users should restrict the key to the Gemini API, use quotas where available, and revoke it after suspected exposure.

Repair/hard refresh preserves the key and local data by default. An explicit destructive checkbox clears IndexedDB, localStorage and sessionStorage.

## Content safety

The CSP blocks third-party scripts/styles, object/embed content and unexpected network endpoints. Model and imported Markdown are rendered using a bundled renderer and DOMPurify allow-list. Imported records are shape-, relationship-, count- and length-validated, and cannot restore attachment references or message execution state.
