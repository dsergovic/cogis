# Pre-Blueprint: Cross-AI Federated Chat History Search Engine

## 1. Executive Summary & Core Intent
The objective is to build a unified web dashboard (`mysite.com`) featuring a single search box that aggregates and queries past chat histories across all major frontier AI labs (OpenAI ChatGPT, Anthropic Claude, Google Gemini, Perplexity, DeepSeek, etc.). 
The primary problem solved is "context fragmentation"—the user frequently switches between various AI assistants and struggles to remember exactly where a past conversation took place. The application will execute live, on-demand searches across these platforms and return direct clickable hyperlinks to the matching past conversations.

## 2. Definitive Architectural Decisions
To balance deep platform integration with strict security and avoid account bans, the following constraints and technical choices have been established:

*   **No Central Scraping / Server-Side Headless Browsers:** Approaches using automated backend tools (like server-side Playwright/Selenium scripts running on remote servers) are rejected. Frontier labs use strict bot-mitigation tools (Cloudflare, CAPTCHAs) that block headless browsers, risking immediate account suspension.
*   **No Persistent Data Storage Requirement:** The core application does not need to extract, clone, or store full text conversation logs on a database. It only needs to fetch the chat *Titles* and their direct *URLs*.
*   **Hybrid Web App + Chrome Extension Architecture:** 
    *   **The Frontend (`mysite.com`):** Serving as the central dashboard and primary user interaction node.
    *   **The Chrome Extension (The Service Bridge):** Running locally in the user's browser. It naturally inherits the user's active, authenticated session cookies and login states. It orchestrates background tabs, programmatically injects query terms into the AI platforms' native search UIs, reads the matching list results from the DOM, and forwards the metadata back to the web application.

## 3. Data Flow & Communication Lifecycle
1.  **Initiation:** The user types a query into `mysite.com` (e.g., "Python UI bug") and hits Enter.
2.  **Dispatch:** The web page uses `window.postMessage()` to securely broadcast the query locally.
3.  **Bridge Interception:** The Chrome Extension’s content script injected into `mysite.com` intercepts the message and passes it to the extension's Background Service Worker via `chrome.runtime.sendMessage()`.
4.  **Target Extraction (Parallel Background Tabs):** 
    *   The Service Worker spawns or targets existing hidden background tabs for each lab.
    *   Content scripts injected into those specific tabs identify the native search bar elements, apply the value, and dispatch input events.
    *   The scripts wait a designated timeout period (~1500ms) for the reactive UI to filter the history list.
    *   The script scrapes the visible text and `href` properties of the filtered anchors.
5.  **Aggregation:** The collected lists are bubbled back through the message channels to `mysite.com`.
6.  **Rendering:** The UI updates dynamically, sorting results by platform with direct links (e.g., `https://chatgpt.com[id]`).

## 4. Frontier Lab Dom Targets & Query Parameter Mappings
The extension uses a multi-pronged approach for querying, utilizing URL-based parameter initialization where possible to force search states, combined with explicit DOM targeting for history extraction.

### OpenAI ChatGPT
*   **Deep-Link Direct Query:** `https://chatgpt.com/?q={query}&hints=search` (or `?search={query}`)
*   **Target Selector (Sidebar History Links):** `a[href*="/c/"]`
*   **Input Simulation:** Find `input[type="search"]` or sidebar search context element, dispatch `input` event with `bubbles: true`.

### Anthropic Claude
*   **Deep-Link Direct Query:** `https://claude.ai{query}`
*   **Target Selector:** Select items within the history navigation panel tracking active `href` links matching matching chat structures.

### Google Gemini / Perplexity / DeepSeek
*   **Fallback Sequence:** If native query strings are locked out or dynamically change, the background script falls back to executing basic text insertions on the history search inputs present in their specific dashboard structures.

## 5. Starter Codebase Framework

### 5.1 Extension Manifest (`manifest.json`)
```json
{
  "manifest_version": 3,
  "name": "Cross-AI Federated Search Companion",
  "version": "1.0.0",
  "description": "Bridges local web app dashboards to active AI platform histories safely.",
  "permissions": ["tabs", "scripting"],
  "host_permissions": [
    "https://mysite.com*",
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://perplexity.ai*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://mysite.com*"],
      "js": ["mysite-bridge.js"]
    },
    {
      "matches": ["https://chatgpt.com/*"],
      "js": ["chatgpt-search.js"]
    }
  ]
}
```

### 5.2 Frontend Web App Communication Bridge (`mysite-bridge.js`)
```javascript
// Listens for queries coming directly from your custom web app dashboard UI
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data.type || event.data.type !== "PERFORM_AI_SEARCH") return;

  const searchQuery = event.data.query;

  // Forward the payload down to the Extension's Background Service Worker
  chrome.runtime.sendMessage({ action: "startFederatedSearch", query: searchQuery }, (response) => {
    // Return unified links list back to the active page window DOM
    window.postMessage({ type: "SEARCH_RESULTS_RETURNED", results: response }, "*");
  });
});
```

### 5.3 Target Content Script Injection Example (`chatgpt-search.js`)
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "searchInPlatform") {
    // Targets the reactive input container for history searching
    const searchInput = document.querySelector('input[type="search"]') || document.querySelector('#sidebar-search'); 
    
    if (searchInput) {
      searchInput.value = request.query;
      searchInput.dispatchEvent(new Event('input', { bubbles: true })); 

      // Brief delay allowing DOM nodes to filter
      setTimeout(() => {
        const foundLinks = [];
        const chatElements = document.querySelectorAll('a[href*="/c/"]'); 
        
        chatElements.forEach(el => {
          if (el.innerText.trim().length > 0) {
            foundLinks.push({
              title: el.innerText.replace(/\n/g, ' ').trim(),
              url: el.href
            });
          }
        });
        sendResponse({ success: true, links: foundLinks });
      }, 1500); 
    } else {
      sendResponse({ success: false, error: "Search DOM element missing" });
    }
    return true; // Retain active channel for asynchronous callback execution
  }
});
```

## 6. Blueprint Refinement Requirements for Cursor
When consuming this data to create a structural execution architecture, the following engineering edge-cases must be planned for:
1.  **Service Worker Tab Control:** Writing robust handling within `background.js` to create tabs with `active: false`, and reusing existing open tabs rather than spanning infinite duplicates during rapid-fire queries.
2.  **Rate/Input Limiting:** Designing UI mechanics within `mysite.com` to prevent event-spamming that could cause layout thrashing across the background content script workers.
3.  **Dynamic DOM Adjustments:** Structuring a standard abstraction layer for target identifiers (e.g., class names, ID attributes) so the system remains resilient when AI platform frontends change their HTML structures.
