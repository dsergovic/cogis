import { MSG, createDebugSetPingOptIn, createDebugSendPing } from '../lib/messaging.js';
import { PLATFORMS, PLATFORM_ORDER } from '../lib/platforms.js';

const tbody = document.getElementById('cogis-platform-tbody');
const refreshBtn = document.getElementById('cogis-debug-refresh');
const optInCheckbox = /** @type {HTMLInputElement|null} */ (
  document.getElementById('cogis-ping-opt-in')
);
const endpointNote = document.getElementById('cogis-ping-endpoint-note');
const pingStatus = document.getElementById('cogis-ping-status');

/** @type {string|null} */
let activePackVersion = null;
/** @type {boolean} */
let pingOptIn = false;
/** @type {boolean} */
let endpointConfigured = false;

/**
 * @param {unknown} value
 */
function display(value) {
  if (value == null || value === '') return '—';
  return String(value);
}

/**
 * @param {number|null|undefined} ms
 */
function formatLatency(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  return `${ms} ms`;
}

/**
 * @param {object} snapshot
 */
function renderPack(snapshot) {
  const pack = snapshot?.selectorPack ?? {};
  activePackVersion = pack.activeVersion ?? pack.localVersion ?? null;
  const set = (key, value) => {
    const el = document.querySelector(`[data-cogis-pack="${key}"]`);
    if (el) el.textContent = display(value);
  };
  set('activeVersion', pack.activeVersion);
  set('localVersion', pack.localVersion);
  set('source', pack.source);
  const refreshBits = [];
  if (pack.lastRefreshOk === true) refreshBits.push('ok');
  if (pack.lastRefreshOk === false) refreshBits.push('failed');
  if (pack.lastErrorCode) refreshBits.push(pack.lastErrorCode);
  set('lastRefresh', refreshBits.length ? refreshBits.join(' · ') : 'not attempted');
}

/**
 * @param {object} snapshot
 */
function renderPlatforms(snapshot) {
  if (!tbody) return;
  tbody.replaceChildren();
  const platforms = snapshot?.platforms ?? {};
  const packVersion = activePackVersion;

  for (const id of PLATFORM_ORDER) {
    const stat = platforms[id] ?? {};
    const tr = document.createElement('tr');
    tr.dataset.cogisPlatform = id;

    const cells = [
      PLATFORMS[id]?.label ?? id,
      formatLatency(stat.latencyMs),
      display(stat.hitCount),
      display(stat.status),
      display(stat.errorCode),
      display(packVersion),
    ];

    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }

    const actionTd = document.createElement('td');
    const reportBtn = document.createElement('button');
    reportBtn.type = 'button';
    reportBtn.className = 'cogis-debug-btn-secondary';
    reportBtn.textContent = 'Report';
    reportBtn.dataset.cogisReport = id;
    const canReport = Boolean(stat.errorCode || (stat.status && stat.status !== 'ready'));
    reportBtn.disabled = !pingOptIn || !canReport;
    reportBtn.title = !pingOptIn
      ? 'Enable opt-in anonymous ping first'
      : !canReport
        ? 'No failure status to report'
        : 'Send anonymous selector-failure ping';
    actionTd.append(reportBtn);
    tr.append(actionTd);

    tbody.append(tr);
  }
}

/**
 * @param {object} snapshot
 */
function renderPrefs(snapshot) {
  pingOptIn = snapshot?.prefs?.pingOptIn === true;
  endpointConfigured = snapshot?.pingEndpointConfigured === true;
  if (optInCheckbox) {
    optInCheckbox.checked = pingOptIn;
  }
  if (endpointNote) {
    endpointNote.textContent = endpointConfigured
      ? 'Ping endpoint is configured for this build.'
      : 'No ping endpoint configured in this build (production URL enablement is an escalation). Report stays local-only until a reviewed URL is set.';
  }
}

/**
 * @param {string} text
 */
function setPingStatus(text) {
  if (pingStatus) pingStatus.textContent = text;
}

async function loadSnapshot() {
  const snapshot = await chrome.runtime.sendMessage({ type: MSG.DEBUG_GET_SNAPSHOT });
  if (!snapshot?.ok) {
    setPingStatus('Could not load debug snapshot.');
    return;
  }
  renderPack(snapshot);
  renderPrefs(snapshot);
  renderPlatforms(snapshot);
}

refreshBtn?.addEventListener('click', () => {
  void loadSnapshot();
});

optInCheckbox?.addEventListener('change', () => {
  const enabled = optInCheckbox.checked === true;
  void chrome.runtime
    .sendMessage(createDebugSetPingOptIn({ pingOptIn: enabled }))
    .then((res) => {
      if (!res?.ok) {
        setPingStatus('Failed to save ping preference.');
        optInCheckbox.checked = pingOptIn;
        return;
      }
      pingOptIn = res.prefs?.pingOptIn === true;
      optInCheckbox.checked = pingOptIn;
      setPingStatus(
        pingOptIn
          ? 'Anonymous ping opt-in saved (still no network until an endpoint is configured).'
          : 'Anonymous ping remains off — zero ping network calls.',
      );
      void loadSnapshot();
    })
    .catch(() => {
      setPingStatus('Failed to save ping preference.');
      optInCheckbox.checked = pingOptIn;
    });
});

tbody?.addEventListener('click', (event) => {
  const target = /** @type {HTMLElement} */ (event.target);
  const platformId = target?.dataset?.cogisReport;
  if (!platformId) return;

  setPingStatus(`Reporting ${platformId}…`);
  void chrome.runtime
    .sendMessage(createDebugSendPing({ platformId }))
    .then((res) => {
      if (!res?.ok) {
        setPingStatus(`Report failed: ${res?.reason ?? res?.error ?? 'unknown'}`);
        return;
      }
      if (!res.sent) {
        setPingStatus(
          `Ping not sent (${res.reason ?? 'blocked'}). Payload would have been ${JSON.stringify(res.payload ?? {})}.`,
        );
        return;
      }
      setPingStatus(`Ping sent for ${platformId} (HTTP ${res.status ?? '?'}).`);
    })
    .catch((err) => {
      setPingStatus(`Report failed: ${String(err?.message ?? err)}`);
    });
});

void loadSnapshot();
