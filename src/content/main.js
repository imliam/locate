/**
 * Locate - Main Content Script Entry Point
 * Initialises the search functionality
 */

(function() {
  'use strict';

  // Prevent multiple initialisations
  if (window.__locateInitialised) {
    return;
  }
  window.__locateInitialised = true;

  // Initialise components
  let searchEngine = null;
  let highlighter = null;
  let replacer = null;
  let overlay = null;

  /**
   * Initialise Locate
   */
  function init() {
    // Check for CSS Custom Highlight API support
    if (!CSS.highlights) {
      console.warn('Locate: CSS Custom Highlight API not supported. Some features may not work.');
    }

    // Create instances
    searchEngine = new window.LocateSearchEngine();
    highlighter = new window.LocateHighlighter();
    replacer = new window.LocateReplacer();
    overlay = new window.LocateSearchOverlay(searchEngine, highlighter, replacer);

    // Store references globally for debugging and extension communication
    window.__locate = {
      searchEngine,
      highlighter,
      replacer,
      overlay,
      version: '1.0.0'
    };

    console.log('Locate: Initialised successfully');
  }

  /**
   * Handle messages from the background script or popup
   */
  function handleMessage(message, sender, sendResponse) {
    switch (message.action) {
      case 'toggle':
        overlay?.toggle();
        sendResponse({ success: true });
        break;

      case 'open':
        overlay?.show();
        sendResponse({ success: true });
        break;

      case 'openReplace':
        overlay?.show(true); // Open with replace mode
        sendResponse({ success: true });
        break;

      case 'close':
        overlay?.hide();
        sendResponse({ success: true });
        break;

      case 'search':
        if (message.query) {
          overlay?.show();
          overlay.input.value = message.query;
          overlay.performSearch();
        }
        sendResponse({ success: true });
        break;

      case 'getStatus':
        sendResponse({
          success: true,
          isOpen: overlay?.isOpen() || false,
          matchCount: searchEngine?.getMatchCount() || 0,
          currentIndex: searchEngine?.getCurrentIndex() || 0
        });
        break;

      case 'getContext':
        // Return current page context for AI side panel
        sendResponse({
          pageTitle: document.title,
          pageUrl: window.location.href,
          searchQuery: overlay?.input?.value || '',
        });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }

    return true; // Keep message channel open for async response
  }

  // Listen for messages from extension
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  // Initialise when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
