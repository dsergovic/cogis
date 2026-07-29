/**
 * Runtime export of the data-only selector pack.
 * Keep in sync with local-pack.json (canonical data file for M5).
 */
export default {
  version: '1.1.0',
  platforms: {
    chatgpt: {
      origin: 'https://chatgpt.com',
      loginUrl: 'https://chatgpt.com/',
      deepLinkPattern: 'https://chatgpt.com/c/{id}',
      selectors: {
        loginButton: '[data-testid="login-button"]',
        signupButton: '[data-testid="signup-button"]',
        searchChatsButton: 'button[aria-label="Search chats"]',
        chatHistoryNav: 'nav[aria-label="Chat history"]',
        createNewChatButton: '[data-testid="create-new-chat-button"]',
      },
      endpoints: {
        session: '/api/auth/session',
        search: '/backend-api/conversations/search',
      },
      searchQueryParams: ['query', 'q'],
      notes:
        'Consumed at runtime by lib/chatgpt-adapter.js (content script dynamic-imports that module). DOM result-row selectors for fallback not yet live-confirmed; endpoint-first per S1.',
    },
    perplexity: {
      origin: 'https://www.perplexity.ai',
      loginUrl: 'https://www.perplexity.ai/',
      deepLinkPattern: 'https://www.perplexity.ai/search/{slug}',
      prefillPattern: 'https://www.perplexity.ai/search?q=',
      apiVersion: '2.18',
      apiClient: 'default',
      selectors: {
        signIn: 'a[href*="/signin"], button[aria-label*="Sign in" i], a[aria-label*="Sign in" i]',
        libraryAuthModal: '[role="dialog"]',
        spacesLink: 'a[href*="/spaces"]',
      },
      endpoints: {
        listAskThreads: '/rest/thread/list_ask_threads',
        spaces: '/rest/spaces',
        spaceThreadsCandidates: [],
      },
      pageSize: 20,
      notes:
        'Endpoint-first per S3: POST list_ask_threads with search_term + session cookies. Capability title-match until proven full-text. Spaces: rely on C (search_term may return Space-tagged threads). Per-Space thread routes gated off until live-proven (spaceThreadsCandidates empty; SPACE_THREAD_ENUMERATION_ENABLED=false). Former ladder B page-anchor scrape is not Spaces recovery and is omitted.',
    },
  },
};
