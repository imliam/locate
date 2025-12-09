/**
 * Search Overlay UI - Floating search interface
 * Mimics native browser find with enhanced features
 */

class SearchOverlay {
  constructor(searchEngine, highlighter, replacer) {
    this.searchEngine = searchEngine;
    this.highlighter = highlighter;
    this.replacer = replacer || new window.LocateReplacer();
    this.storage = new window.LocateStorage();
    this.varDumper = new window.LocateVarDumperIntegration();
    this.aiPanel = null; // Lazy-initialised AI panel
    this.overlay = null;
    this.input = null;
    this.replaceInput = null;
    this.matchCount = null;
    this.isVisible = false;
    this.replaceMode = false;
    this.toolbarExpanded = false;
    this.replaceScope = 'input'; // 'input', 'page', or 'html'
    this.settings = null;
    this.options = {
      caseSensitive: false,
      wholeWord: false,
      searchHidden: false // Whether to search hidden elements
    };
    this.searchTimeout = null;

    // Search history
    this.searchHistory = [];
    this.searchHistoryIndex = -1;
    this.searchHistoryTemp = ''; // Stores current input when navigating history

    // Replace history
    this.replaceHistory = [];
    this.replaceHistoryIndex = -1;
    this.replaceHistoryTemp = '';

    this.maxHistoryLength = 100;
    this.hasAIProvider = false; // Whether any AI provider is configured

    this.init();
  }

  /**
   * Initialise the overlay
   */
  init() {
    this.createOverlay();
    this.attachEventListeners();
    this.loadSettings();
    this.loadHistory();
    this.setupSettingsListener();
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      this.settings = await this.storage.getSettings();

      // Apply settings
      this.options.caseSensitive = this.settings.caseSensitive;
      this.options.wholeWord = this.settings.wholeWord;

      // Check if any AI provider is configured
      const apiKeys = this.settings.ai?.apiKeys || {};
      this.hasAIProvider = Object.values(apiKeys).some(key => key?.trim());

      this.updateOptionButtons();
      this.updateHighlightColors();
    } catch (e) {
      console.log('Locate: Could not load settings', e);
    }
  }

  /**
   * Load search/replace history from storage
   */
  async loadHistory() {
    try {
      const history = await this.storage.getHistory();
      this.searchHistory = history.searchHistory || [];
      this.replaceHistory = history.replaceHistory || [];
    } catch (e) {
      console.log('Locate: Could not load history', e);
    }
  }

  /**
   * Save search/replace history to storage
   */
  async saveHistory() {
    try {
      await this.storage.saveHistory({
        searchHistory: this.searchHistory,
        replaceHistory: this.replaceHistory
      });
    } catch (e) {
      console.log('Locate: Could not save history', e);
    }
  }

  /**
   * Set up listener for settings changes
   */
  setupSettingsListener() {
    this.storage.addListener((newSettings) => {
      this.settings = newSettings;
      this.updateHighlightColors();

      // Update AI provider availability
      const apiKeys = newSettings.ai?.apiKeys || {};
      this.hasAIProvider = Object.values(apiKeys).some(key => key?.trim());

      // Re-search if visible to apply new highlight colors
      if (this.isVisible && this.input.value) {
        this.performSearch();
      }
    });
  }

  /**
   * Update highlight colors from settings
   */
  updateHighlightColors() {
    if (!this.settings) return;

    // Update the CSS custom properties for highlights
    const styleId = 'locate-settings-styles';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    const opacity = this.settings.highlightOpacity;
    const highlightColor = this.hexToRgba(this.settings.highlightColor, opacity);
    const currentColor = this.hexToRgba(this.settings.highlightCurrentColor, Math.min(opacity + 0.2, 1));

    style.textContent = `
      ::highlight(locate-search-highlight) {
        background-color: ${highlightColor} !important;
      }
      ::highlight(locate-current-highlight) {
        background-color: ${currentColor} !important;
      }
    `;
  }

  /**
   * Convert hex color to rgba
   * @param {string} hex - Hex color
   * @param {number} alpha - Alpha value
   * @returns {string} RGBA color string
   */
  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Update option button states
   */
  updateOptionButtons() {
    if (this.caseSensitiveBtn) {
      this.caseSensitiveBtn.classList.toggle('active', this.options.caseSensitive);
      this.caseSensitiveBtn.setAttribute('aria-pressed', this.options.caseSensitive);
    }
    if (this.wholeWordBtn) {
      this.wholeWordBtn.classList.toggle('active', this.options.wholeWord);
      this.wholeWordBtn.setAttribute('aria-pressed', this.options.wholeWord);
    }
  }

  /**
   * Create the overlay DOM structure
   */
  createOverlay() {
    // Create overlay container
    this.overlay = document.createElement('div');
    this.overlay.id = 'locate-overlay';
    this.overlay.className = 'locate-overlay';
    this.overlay.setAttribute('role', 'search');
    this.overlay.setAttribute('aria-label', 'Find in page');

    this.overlay.innerHTML = `
      <div class="locate-overlay-content">
        <div class="locate-main-row">
          <div class="locate-search-wrapper">
            <div class="locate-input-container">
              <input
                type="text"
                class="locate-search-input"
                placeholder="Find..."
                aria-label="Search text"
                autocomplete="off"
                spellcheck="false"
              />
              <span class="locate-ai-hint">Press <kbd>Tab</kbd> to ask AI</span>
              <span class="locate-mode-indicator"></span>
            </div>
            <span class="locate-match-count" aria-live="polite">
              <span class="locate-match-current">0</span>
              <span class="locate-match-separator"> of </span>
              <span class="locate-match-total">0</span>
            </span>
          </div>
          <button class="locate-btn locate-btn-more" title="More options" aria-label="Toggle options" aria-expanded="false">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
            </svg>
          </button>
        </div>
        <div class="locate-toolbar">
          <div class="locate-toolbar-row">
            <button class="locate-btn locate-btn-prev" title="Previous match (Shift+Enter)" aria-label="Previous match">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 6l-4 4h8l-4-4z"/>
              </svg>
            </button>
            <button class="locate-btn locate-btn-next" title="Next match (Enter)" aria-label="Next match">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 10l4-4H4l4 4z"/>
              </svg>
            </button>
            <div class="locate-separator"></div>
            <button class="locate-btn locate-btn-option" data-option="caseSensitive" title="Match case (Cmd+Alt+C)" aria-label="Match case" aria-pressed="false">
              Aa
            </button>
            <button class="locate-btn locate-btn-option" data-option="wholeWord" title="Whole word (Cmd+Alt+W)" aria-label="Whole word" aria-pressed="false">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 3h1v10H1V3zm13 0h1v10h-1V3zM5.5 6h5l-2.5 5-2.5-5z"/>
              </svg>
            </button>
            <button class="locate-btn locate-btn-option locate-btn-regex" data-option="regex" title="Use regex (/pattern/flags)" aria-label="Regex mode" aria-pressed="false">
              .*
            </button>
            <button class="locate-btn locate-btn-option locate-btn-css" data-option="css" title="CSS selector (css:selector)" aria-label="CSS selector mode" aria-pressed="false">
              css
            </button>
            <button class="locate-btn locate-btn-option locate-btn-xpath" data-option="xpath" title="XPath selector (//path or xpath:expression)" aria-label="XPath selector mode" aria-pressed="false">
              //
            </button>
            <div class="locate-separator"></div>
            <button class="locate-btn locate-btn-option locate-btn-hidden" data-option="searchHidden" title="Include hidden elements" aria-label="Search hidden elements" aria-pressed="false">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/>
                <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299l.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/>
                <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709z"/>
                <path d="M13.646 14.354l-12-12 .708-.708 12 12-.708.708z"/>
              </svg>
            </button>
            <div class="locate-separator"></div>
            <button class="locate-btn locate-btn-replace-toggle" title="Toggle Replace (Cmd+Alt+F)" aria-label="Toggle replace mode" aria-pressed="false">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.5 2a.5.5 0 00-.5.5v11a.5.5 0 001 0v-11a.5.5 0 00-.5-.5zm9.354 5.146l-3.5-3.5a.5.5 0 00-.708.708L11.293 7H6a.5.5 0 000 1h5.293l-2.647 2.646a.5.5 0 00.708.708l3.5-3.5a.5.5 0 000-.708z"/>
              </svg>
              <span>Replace</span>
            </button>
            <div class="locate-toolbar-spacer"></div>
            <button class="locate-btn locate-btn-close" title="Close (Escape)" aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 6.586L11.293 3.293l1.414 1.414L9.414 8l3.293 3.293-1.414 1.414L8 9.414l-3.293 3.293-1.414-1.414L6.586 8 3.293 4.707l1.414-1.414L8 6.586z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="locate-replace-row" style="display: none;">
          <div class="locate-replace-wrapper">
            <input
              type="text"
              class="locate-replace-input"
              placeholder="Replace with..."
              aria-label="Replace text"
              autocomplete="off"
              spellcheck="false"
            />
            <div class="locate-replace-scope" role="radiogroup" aria-label="Replace scope">
              <label class="locate-scope-option active" title="Replace only in input fields, textareas, and contenteditable">
                <input type="radio" name="replaceScope" value="input" checked>
                <span>input</span>
              </label>
              <label class="locate-scope-option" title="Replace in visible text on the page">
                <input type="radio" name="replaceScope" value="page">
                <span>page</span>
              </label>
            </div>
          </div>
          <div class="locate-replace-controls">
            <button class="locate-btn locate-btn-replace-all" title="Replace all (Cmd+Enter)" aria-label="Replace all matches">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path fill-rule="evenodd" d="M1.646 6.646a.5.5 0 0 1 .708 0L8 12.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                <path fill-rule="evenodd" d="M1.646 2.646a.5.5 0 0 1 .708 0L8 8.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
              </svg>
              <span>Replace All</span>
            </button>
            <button class="locate-btn locate-btn-undo" title="Undo last replacement (Cmd+Z)" aria-label="Undo replacement" disabled>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path fill-rule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
                <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="locate-replace-info"></div>
        <div class="locate-error-message"></div>
      </div>
    `;

    // Get references to elements
    this.input = this.overlay.querySelector('.locate-search-input');
    this.replaceInput = this.overlay.querySelector('.locate-replace-input');
    this.matchCount = this.overlay.querySelector('.locate-match-count');
    this.aiHint = this.overlay.querySelector('.locate-ai-hint');
    this.moreBtn = this.overlay.querySelector('.locate-btn-more');
    this.toolbar = this.overlay.querySelector('.locate-toolbar');
    this.prevBtn = this.overlay.querySelector('.locate-btn-prev');
    this.nextBtn = this.overlay.querySelector('.locate-btn-next');
    this.closeBtn = this.overlay.querySelector('.locate-btn-close');
    this.caseSensitiveBtn = this.overlay.querySelector('[data-option="caseSensitive"]');
    this.wholeWordBtn = this.overlay.querySelector('[data-option="wholeWord"]');
    this.regexBtn = this.overlay.querySelector('[data-option="regex"]');
    this.cssBtn = this.overlay.querySelector('[data-option="css"]');
    this.xpathBtn = this.overlay.querySelector('[data-option="xpath"]');
    this.searchHiddenBtn = this.overlay.querySelector('[data-option="searchHidden"]');
    this.replaceToggleBtn = this.overlay.querySelector('.locate-btn-replace-toggle');
    this.replaceRow = this.overlay.querySelector('.locate-replace-row');
    this.replaceScopeGroup = this.overlay.querySelector('.locate-replace-scope');
    this.replaceAllBtn = this.overlay.querySelector('.locate-btn-replace-all');
    this.undoBtn = this.overlay.querySelector('.locate-btn-undo');
    this.modeIndicator = this.overlay.querySelector('.locate-mode-indicator');
    this.replaceInfo = this.overlay.querySelector('.locate-replace-info');
    this.errorMessage = this.overlay.querySelector('.locate-error-message');

    // Append to document
    document.body.appendChild(this.overlay);
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Input events
    this.input.addEventListener('input', () => this.handleInput());
    this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.replaceInput.addEventListener('keydown', (e) => this.handleReplaceKeyDown(e));

    // Button events
    this.prevBtn.addEventListener('click', () => this.goToPrevious());
    this.nextBtn.addEventListener('click', () => this.goToNext());
    this.closeBtn.addEventListener('click', () => this.hide());
    this.moreBtn.addEventListener('click', () => this.toggleToolbar());
    this.aiHint.addEventListener('click', () => this.openAIPanel());

    // Option toggle buttons
    this.caseSensitiveBtn.addEventListener('click', () => this.toggleOption('caseSensitive'));
    this.wholeWordBtn.addEventListener('click', () => this.toggleOption('wholeWord'));
    this.regexBtn.addEventListener('click', () => this.toggleRegexMode());
    this.cssBtn.addEventListener('click', () => this.toggleCSSMode());
    this.xpathBtn.addEventListener('click', () => this.toggleXPathMode());
    this.searchHiddenBtn.addEventListener('click', () => this.toggleSearchHidden());

    // Replace controls
    this.replaceToggleBtn.addEventListener('click', () => this.toggleReplaceMode());
    this.replaceAllBtn.addEventListener('click', () => this.replaceAllMatches());
    this.undoBtn.addEventListener('click', () => this.undoReplacement());

    // Replace scope radio buttons
    this.replaceScopeGroup.addEventListener('change', (e) => {
      if (e.target.type === 'radio') {
        this.replaceScope = e.target.value;
        // Update active class on labels
        this.replaceScopeGroup.querySelectorAll('.locate-scope-option').forEach(label => {
          label.classList.toggle('active', label.querySelector('input').checked);
        });
      }
    });

    // Prevent overlay from stealing focus from input
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target !== this.input && e.target !== this.replaceInput) {
        e.preventDefault();
      }
    });

    // Global keyboard shortcut for CMD+F / Ctrl+F
    document.addEventListener('keydown', (e) => this.handleGlobalKeyDown(e), true);
  }

  /**
   * Check if an event matches a configured keybind
   * @param {KeyboardEvent} e - Keyboard event
   * @param {string} action - Keybind action name
   * @returns {boolean}
   */
  matchesKeybind(e, action) {
    if (!this.settings?.keybinds?.[action]) {
      return false;
    }
    return this.storage.eventMatchesKeybind(e, this.settings.keybinds[action]);
  }

  /**
   * Handle global keydown events
   * @param {KeyboardEvent} e
   */
  handleGlobalKeyDown(e) {
    // Use configured keybinds if available
    if (this.settings?.keybinds) {
      // Toggle search
      if (this.matchesKeybind(e, 'toggle')) {
        e.preventDefault();
        e.stopPropagation();
        this.show();
        return;
      }

      // Toggle replace
      if (this.matchesKeybind(e, 'toggleReplace')) {
        e.preventDefault();
        e.stopPropagation();
        this.show(true);
        return;
      }

      // Close
      if (this.matchesKeybind(e, 'close') && this.isVisible) {
        e.preventDefault();
        this.hide();
        return;
      }
    } else {
      // Fallback to default keybinds
      // CMD+F or Ctrl+F to open/focus
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        this.show();
        return;
      }

      // CMD+Alt+F or Ctrl+Alt+F to open with replace
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        this.show(true);
        return;
      }

      // Escape to close (when overlay is visible)
      if (e.key === 'Escape' && this.isVisible) {
        e.preventDefault();
        this.hide();
        return;
      }
    }
  }

  /**
   * Handle input field keydown
   * @param {KeyboardEvent} e
   */
  handleKeyDown(e) {
    // Handle history navigation with ArrowUp/ArrowDown
    if (e.key === 'ArrowUp' && this.input.selectionStart === 0 && this.input.selectionEnd === 0) {
      // Only navigate if there's history and we can go back
      if (this.searchHistory.length > 0 && (this.searchHistoryIndex === -1 || this.searchHistoryIndex > 0)) {
        e.preventDefault();
        this.navigateSearchHistory('back');
        return;
      }
    }
    if (e.key === 'ArrowDown' && this.input.selectionStart === this.input.value.length && this.input.selectionEnd === this.input.value.length) {
      // Only navigate if we're currently in history
      if (this.searchHistoryIndex !== -1) {
        e.preventDefault();
        this.navigateSearchHistory('forward');
        return;
      }
    }

    // Use configured keybinds if available
    if (this.settings?.keybinds) {
      // Next match
      if (this.matchesKeybind(e, 'nextMatch')) {
        e.preventDefault();
        // If no matches yet (e.g., short query), perform search first
        if (this.searchEngine.matches.length === 0 && this.input.value.length > 0) {
          this.performSearch();
          return;
        }
        if (this.searchEngine.matches.length > 0) {
          this.addToSearchHistory(this.input.value);
        }
        this.goToNext();
        return;
      }

      // Previous match
      if (this.matchesKeybind(e, 'prevMatch')) {
        e.preventDefault();
        // If no matches yet (e.g., short query), perform search first
        if (this.searchEngine.matches.length === 0 && this.input.value.length > 0) {
          this.performSearch();
          return;
        }
        if (this.searchEngine.matches.length > 0) {
          this.addToSearchHistory(this.input.value);
        }
        this.goToPrevious();
        return;
      }

      // Replace all (or focus current match if replace mode is off)
      if (this.matchesKeybind(e, 'replaceAll')) {
        e.preventDefault();
        if (this.replaceMode) {
          this.replaceAllMatches();
        } else {
          this.focusCurrentMatch();
        }
        return;
      }

      // Replace current (only if replace mode is active, otherwise focus current match)
      if (this.matchesKeybind(e, 'replaceCurrent')) {
        e.preventDefault();
        if (this.replaceMode) {
          this.replaceCurrent();
        } else {
          this.focusCurrentMatch();
        }
        return;
      }

      // Close
      if (this.matchesKeybind(e, 'close')) {
        e.preventDefault();
        this.hide();
        return;
      }

      // Toggle case sensitive
      if (this.matchesKeybind(e, 'toggleCase')) {
        e.preventDefault();
        this.toggleOption('caseSensitive');
        return;
      }

      // Toggle whole word
      if (this.matchesKeybind(e, 'toggleWholeWord')) {
        e.preventDefault();
        this.toggleOption('wholeWord');
        return;
      }
    } else {
      // Fallback to default keybinds
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          // If no matches yet (e.g., short query), perform search first
          if (this.searchEngine.matches.length === 0 && this.input.value.length > 0) {
            this.performSearch();
            return;
          }
          // Add to history when pressing Enter with matches
          if (this.searchEngine.matches.length > 0) {
            this.addToSearchHistory(this.input.value);
          }
          if (e.shiftKey) {
            this.goToPrevious();
          } else {
            this.goToNext();
          }
          return;

        case 'Escape':
          e.preventDefault();
          this.hide();
          return;
      }

      // Cmd/Ctrl+Alt+C for case sensitive toggle
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        this.toggleOption('caseSensitive');
        return;
      }

      // Cmd/Ctrl+Alt+W for whole word toggle
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        this.toggleOption('wholeWord');
        return;
      }
    }

    // Tab to move to replace input if visible, otherwise open AI panel
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      if (this.replaceMode) {
        this.replaceInput.focus();
      } else {
        this.openAIPanel();
      }
      return;
    }

    // Cmd/Ctrl+Alt+R for regex template (always works)
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      this.insertRegexTemplate();
      return;
    }

    // If auto-search is disabled, Enter triggers search
    if (this.settings && !this.settings.autoSearch && e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      this.performSearch();
      return;
    }
  }

  /**
   * Handle replace input keydown
   * @param {KeyboardEvent} e
   */
  handleReplaceKeyDown(e) {
    // Handle history navigation with ArrowUp/ArrowDown
    if (e.key === 'ArrowUp' && this.replaceInput.selectionStart === 0 && this.replaceInput.selectionEnd === 0) {
      // Only navigate if there's history and we can go back
      if (this.replaceHistory.length > 0 && (this.replaceHistoryIndex === -1 || this.replaceHistoryIndex > 0)) {
        e.preventDefault();
        this.navigateReplaceHistory('back');
        return;
      }
    }
    if (e.key === 'ArrowDown' && this.replaceInput.selectionStart === this.replaceInput.value.length && this.replaceInput.selectionEnd === this.replaceInput.value.length) {
      // Only navigate if we're currently in history
      if (this.replaceHistoryIndex !== -1) {
        e.preventDefault();
        this.navigateReplaceHistory('forward');
        return;
      }
    }

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (e.shiftKey && (e.metaKey || e.ctrlKey)) {
          this.replaceAllMatches();
        } else if (e.shiftKey) {
          this.goToPrevious();
        } else {
          this.replaceCurrent();
        }
        break;

      case 'Escape':
        e.preventDefault();
        this.hide();
        break;

      case 'Tab':
        if (e.shiftKey) {
          e.preventDefault();
          this.input.focus();
        }
        break;
    }

    // Cmd+Z for undo
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      this.undoReplacement();
    }
  }

  /**
   * Toggle search hidden elements option
   */
  toggleSearchHidden() {
    this.options.searchHidden = !this.options.searchHidden;
    // Update button state
    this.searchHiddenBtn.classList.toggle('active', this.options.searchHidden);
    this.searchHiddenBtn.setAttribute('aria-pressed', this.options.searchHidden.toString());
    // Re-run search with new option
    this.performSearch();
  }

  /**
   * Toggle the toolbar visibility
   */
  toggleToolbar() {
    this.toolbarExpanded = !this.toolbarExpanded;
    this.toolbar.classList.toggle('expanded', this.toolbarExpanded);
    this.moreBtn.classList.toggle('active', this.toolbarExpanded);
    this.moreBtn.setAttribute('aria-expanded', this.toolbarExpanded.toString());
  }

  /**
   * Toggle replace mode
   */
  toggleReplaceMode() {
    this.replaceMode = !this.replaceMode;
    this.replaceRow.style.setProperty('display', this.replaceMode ? 'flex' : 'none', 'important');
    this.replaceToggleBtn.classList.toggle('active', this.replaceMode);
    this.replaceToggleBtn.setAttribute('aria-pressed', this.replaceMode.toString());
    this.overlay.classList.toggle('replace-mode', this.replaceMode);

    if (this.replaceMode) {
      this.replaceInput.focus();
    } else {
      this.input.focus();
    }

    this.hideReplaceInfo();
  }

  /**
   * Replace the current match
   */
  replaceCurrent() {
    const currentMatch = this.searchEngine.getCurrentMatch();
    if (!currentMatch) {
      this.showReplaceInfo('No match selected', 'error');
      return;
    }

    const replacement = this.replaceInput.value;
    const mode = this.searchEngine.getSearchMode();

    // Check if we can replace based on scope
    const canReplaceResult = this.replacer.canReplace(currentMatch, this.replaceScope);
    if (!canReplaceResult.canReplace) {
      this.showReplaceInfo(canReplaceResult.reason, 'error');
      return;
    }

    // Process regex replacement if needed
    let actualReplacement = replacement;
    if (mode === 'regex' && currentMatch.groups) {
      actualReplacement = this.replacer.processRegexReplacement(replacement, currentMatch);
    }

    // Perform replacement
    const result = this.replacer.replaceMatch(currentMatch, actualReplacement, this.replaceScope);

    if (result.success) {
      this.showReplaceInfo('Replaced 1 match', 'success');
      this.updateUndoButton();

      // Add to history
      this.addToSearchHistory(this.input.value);
      this.addToReplaceHistory(replacement);

      // Re-run search to update matches
      setTimeout(() => {
        this.performSearch();
      }, 50);
    } else {
      this.showReplaceInfo(result.error || 'Replacement failed', 'error');
    }
  }

  /**
   * Focus the current highlighted match element on the page
   * This allows the user to interact with the element directly
   */
  focusCurrentMatch() {
    const currentMatch = this.searchEngine.getCurrentMatch();
    if (!currentMatch) {
      return;
    }

    // For CSS/XPath selector matches, focus the element directly
    if ((currentMatch.type === 'css' || currentMatch.type === 'xpath') && currentMatch.element) {
      this.focusElement(currentMatch.element);
      return;
    }

    // For text/regex matches, find the containing element and focus it
    if (currentMatch.range) {
      const container = currentMatch.range.commonAncestorContainer;
      const element = container.nodeType === Node.TEXT_NODE
        ? container.parentElement
        : container;

      if (element) {
        this.focusElement(element);
      }
    }
  }

  /**
   * Focus an element on the page, making it interactive
   * @param {Element} element - The element to focus
   */
  focusElement(element) {
    if (!element) return;

    // Scroll the element into view first
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // If the element is focusable (input, textarea, contenteditable, button, link, etc.), focus it
    const focusableSelector = 'input, textarea, select, button, a[href], [tabindex], [contenteditable="true"]';

    if (element.matches(focusableSelector)) {
      element.focus();
    } else {
      // Find the closest focusable parent or child
      const focusableChild = element.querySelector(focusableSelector);
      const focusableParent = element.closest(focusableSelector);

      if (focusableChild) {
        focusableChild.focus();
      } else if (focusableParent) {
        focusableParent.focus();
      } else {
        // Make the element temporarily focusable
        const hadTabIndex = element.hasAttribute('tabindex');
        const originalTabIndex = element.getAttribute('tabindex');

        element.setAttribute('tabindex', '-1');
        element.focus();

        // Restore original tabindex state after a brief delay
        setTimeout(() => {
          if (hadTabIndex) {
            element.setAttribute('tabindex', originalTabIndex);
          } else {
            element.removeAttribute('tabindex');
          }
        }, 100);
      }
    }

    // Hide the overlay to allow interaction with the focused element
    this.hide();
  }

  /**
   * Open the AI panel with current search context
   */
  openAIPanel() {
    // Lazy-initialise the AI panel
    if (!this.aiPanel) {
      this.aiPanel = new window.LocateAIPanel();
    }

    // Gather context to send to the panel
    const context = {
      pageTitle: document.title,
      pageUrl: window.location.href,
      searchQuery: this.input.value || '',
    };

    // Show the panel with context, send immediately if there's a query
    this.aiPanel.show(context, { sendImmediately: !!this.input.value });

    // Close the search overlay since AI panel is now open
    this.hide();
  }

  /**
   * Show a temporary message in the overlay
   * @param {string} message
   */
  showTemporaryMessage(message) {
    // Create or update the message element
    let msgEl = this.overlay.querySelector('.locate-temp-message');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.className = 'locate-temp-message';
      msgEl.style.cssText = `
        position: absolute;
        bottom: -30px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--locate-bg, #333);
        color: var(--locate-text, #fff);
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      `;
      this.overlay.appendChild(msgEl);
    }
    msgEl.textContent = message;
    msgEl.style.display = 'block';

    // Hide after 3 seconds
    setTimeout(() => {
      if (msgEl) {
        msgEl.style.display = 'none';
      }
    }, 3000);
  }

  /**
   * Replace all matches
   */
  replaceAllMatches() {
    const matches = this.searchEngine.matches;
    if (!matches || matches.length === 0) {
      this.showReplaceInfo('No matches to replace', 'error');
      return;
    }

    const replacement = this.replaceInput.value;
    const mode = this.searchEngine.getSearchMode();

    // Perform replace all with scope
    const results = this.replacer.replaceAll(
      matches,
      replacement,
      this.replaceScope,
      mode,
      this.input.value
    );

    // Show results
    if (results.successCount > 0) {
      let message = `Replaced ${results.successCount} match${results.successCount !== 1 ? 'es' : ''}`;
      if (results.failCount > 0) {
        message += ` (${results.failCount} failed)`;
      }
      this.showReplaceInfo(message, results.failCount > 0 ? 'warning' : 'success');
      this.updateUndoButton();

      // Add to history
      this.addToSearchHistory(this.input.value);
      this.addToReplaceHistory(replacement);

      // Re-run search to update matches
      setTimeout(() => {
        this.performSearch();
      }, 50);
    } else {
      const errorMsg = results.errors.length > 0 ? results.errors[0] : 'No matches could be replaced';
      this.showReplaceInfo(errorMsg, 'error');
    }
  }

  /**
   * Undo the last replacement
   */
  undoReplacement() {
    const result = this.replacer.undo();

    if (result.success) {
      this.showReplaceInfo('Undid last replacement', 'success');
      this.updateUndoButton();

      // Re-run search to update matches
      setTimeout(() => {
        this.performSearch();
      }, 50);
    } else {
      this.showReplaceInfo(result.error || 'Nothing to undo', 'error');
    }
  }

  /**
   * Update the undo button state
   */
  updateUndoButton() {
    const canUndo = this.replacer.canUndo();
    this.undoBtn.disabled = !canUndo;
    if (canUndo) {
      this.undoBtn.title = `Undo last replacement (${this.replacer.getUndoCount()} available)`;
    } else {
      this.undoBtn.title = 'Nothing to undo';
    }
  }

  /**
   * Show replace info message
   * @param {string} message - Message to display
   * @param {string} type - Message type ('success', 'error', 'warning', 'info')
   */
  showReplaceInfo(message, type = 'info') {
    this.replaceInfo.textContent = message;
    this.replaceInfo.className = `locate-replace-info locate-replace-info-${type}`;
    this.replaceInfo.style.setProperty('display', 'block', 'important');

    // Auto-hide after 3 seconds for success messages
    if (type === 'success') {
      setTimeout(() => {
        this.hideReplaceInfo();
      }, 3000);
    }
  }

  /**
   * Hide replace info message
   */
  hideReplaceInfo() {
    this.replaceInfo.textContent = '';
    this.replaceInfo.style.setProperty('display', 'none', 'important');
  }

  /**
   * Toggle regex mode - add or remove regex syntax
   */
  toggleRegexMode() {
    const value = this.input.value;
    const isRegex = value.startsWith('/') && value.match(/\/[gimsuy]*$/);

    if (isRegex) {
      // Remove regex syntax
      const match = value.match(/^\/(.*)\/[gimsuy]*$/);
      if (match) {
        this.input.value = match[1];
      }
    } else {
      // Remove CSS prefix if present, then add regex syntax
      let cleanValue = value;
      if (cleanValue.startsWith('css:')) {
        cleanValue = cleanValue.slice(4).trim();
      } else if (cleanValue.startsWith('$')) {
        cleanValue = cleanValue.slice(1).trim();
      }
      this.input.value = `/${cleanValue}/`;
      // Position cursor before the closing slash
      this.input.setSelectionRange(this.input.value.length - 1, this.input.value.length - 1);
    }
    this.input.focus();
    this.performSearch();
  }

  /**
   * Toggle CSS selector mode - add or remove css: prefix
   */
  toggleCSSMode() {
    const value = this.input.value;
    const hasPrefix = value.startsWith('css:') || value.startsWith('$');

    if (hasPrefix) {
      // Remove CSS prefix
      if (value.startsWith('css:')) {
        this.input.value = value.slice(4).trim();
      } else if (value.startsWith('$')) {
        this.input.value = value.slice(1).trim();
      }
    } else {
      // Remove regex syntax if present, then add CSS prefix
      let cleanValue = value;
      const regexMatch = value.match(/^\/(.*)\/(([gimsuy]*$))/);
      if (regexMatch) {
        cleanValue = regexMatch[1];
      }
      // Remove xpath prefix if present
      if (cleanValue.startsWith('xpath:')) {
        cleanValue = cleanValue.slice(6).trim();
      } else if (cleanValue.startsWith('//')) {
        cleanValue = cleanValue.slice(2).trim();
      }
      this.input.value = `css:${cleanValue}`;
    }
    this.input.focus();
    this.performSearch();
  }

  /**
   * Toggle XPath selector mode - add or remove xpath: prefix or //
   */
  toggleXPathMode() {
    const value = this.input.value;
    const hasXPathPrefix = value.startsWith('xpath:') || value.startsWith('//');

    if (hasXPathPrefix) {
      // Remove XPath prefix
      if (value.startsWith('xpath:')) {
        this.input.value = value.slice(6).trim();
      } else if (value.startsWith('//')) {
        this.input.value = value.slice(2).trim();
      }
    } else {
      // Remove regex/css syntax if present, then add XPath prefix
      let cleanValue = value;
      const regexMatch = value.match(/^\/(.*)\/(([gimsuy]*)$)/);
      if (regexMatch) {
        cleanValue = regexMatch[1];
      }
      // Remove css prefix if present
      if (cleanValue.startsWith('css:')) {
        cleanValue = cleanValue.slice(4).trim();
      } else if (cleanValue.startsWith('$')) {
        cleanValue = cleanValue.slice(1).trim();
      }
      this.input.value = `//${cleanValue}`;
    }
    this.input.focus();
    this.performSearch();
  }

  /**
   * Insert regex template into input (legacy method)
   */
  insertRegexTemplate() {
    this.toggleRegexMode();
  }

  /**
   * Handle input changes with debouncing
   */
  handleInput() {
    // Check if auto-search is enabled
    if (this.settings && !this.settings.autoSearch) {
      return; // Don't auto-search, wait for Enter key
    }

    // Debounce search for performance
    clearTimeout(this.searchTimeout);

    // For short queries (1-2 chars), don't auto-search to prevent performance issues
    // User can still press Enter to manually trigger search for these
    const queryLength = this.input.value.length;
    const MIN_AUTO_SEARCH_LENGTH = 3;

    if (queryLength > 0 && queryLength < MIN_AUTO_SEARCH_LENGTH) {
      // Show hint that user needs to press Enter for short queries
      this.showShortQueryHint();
      return;
    }

    // Clear any short query hint
    this.hideShortQueryHint();

    // Use longer debounce when VarDumper is present (expand/collapse is expensive)
    let delay = this.settings?.searchDelay || 150;
    if (this.varDumper.hasVarDumper()) {
      delay = Math.max(delay, 300);
    }

    this.searchTimeout = setTimeout(() => {
      this.performSearch();
    }, delay);
  }

  /**
   * Perform the search
   */
  performSearch() {
    const query = this.input.value;

    // Clear error
    this.hideError();

    // Only do expensive VarDumper operations for meaningful queries (3+ chars)
    // This prevents lag when typing the first few characters
    const shouldSearchVarDumper = this.varDumper.hasVarDumper() && query.length >= 3;

    // Expand all VarDumper sections before searching (to search hidden content)
    if (shouldSearchVarDumper) {
      this.varDumper.expandAllForSearch();
    }

    // Build search options
    // Always include editable fields in search results
    // In replace mode with 'input' scope, ONLY search editable fields
    const searchOptions = { ...this.options };
    if (this.replaceMode && this.replaceScope === 'input') {
      searchOptions.searchScope = 'input';
    } else {
      searchOptions.includeEditableFields = true;
    }

    // Perform search
    const matches = this.searchEngine.search(query, searchOptions);

    // Check for errors
    const error = this.searchEngine.getLastError();
    if (error) {
      this.showError(error);
    }

    // Collapse VarDumper sections, then reveal only matches
    if (shouldSearchVarDumper) {
      this.varDumper.collapseAllAfterSearch();
      this.varDumper.revealMatches(matches);
    }

    // Update mode indicator
    this.updateModeIndicator();

    // Update highlights with search mode
    const mode = this.searchEngine.getSearchMode();
    this.highlighter.highlightMatches(matches, this.searchEngine.currentIndex, mode);

    // Update match count display
    this.updateMatchCount();

    // Scroll to current match and trigger sheen
    if (matches.length > 0) {
      this.searchEngine.scrollToCurrentMatch();
      const currentMatch = this.searchEngine.getCurrentMatch();
      if (currentMatch) {
        this.highlighter.triggerSheen(currentMatch);
      }
    }
  }

  /**
   * Add a search query to history
   * @param {string} query - The search query to add
   */
  addToSearchHistory(query) {
    if (!query || query.trim() === '') return;

    // Remove duplicate if exists
    const existingIndex = this.searchHistory.indexOf(query);
    if (existingIndex !== -1) {
      this.searchHistory.splice(existingIndex, 1);
    }

    // Add to end of history
    this.searchHistory.push(query);

    // Limit history length
    if (this.searchHistory.length > this.maxHistoryLength) {
      this.searchHistory.shift();
    }

    // Reset history index
    this.searchHistoryIndex = -1;
    this.searchHistoryTemp = '';

    // Persist to storage
    this.saveHistory();
  }

  /**
   * Navigate through search history
   * @param {string} direction - 'back' or 'forward'
   */
  navigateSearchHistory(direction) {
    if (this.searchHistory.length === 0) return;

    // Save current input when starting to navigate
    if (this.searchHistoryIndex === -1) {
      this.searchHistoryTemp = this.input.value;
    }

    if (direction === 'back') {
      // Go back in history (older)
      if (this.searchHistoryIndex === -1) {
        // Start from the most recent that's different from current input
        let startIndex = this.searchHistory.length - 1;
        // Skip if the last history item is the same as current input
        while (startIndex >= 0 && this.searchHistory[startIndex] === this.input.value) {
          startIndex--;
        }
        if (startIndex >= 0) {
          this.searchHistoryIndex = startIndex;
          this.input.value = this.searchHistory[this.searchHistoryIndex];
        }
      } else if (this.searchHistoryIndex > 0) {
        this.searchHistoryIndex--;
        this.input.value = this.searchHistory[this.searchHistoryIndex];
      }
    } else {
      // Go forward in history (newer)
      if (this.searchHistoryIndex !== -1) {
        this.searchHistoryIndex++;
        if (this.searchHistoryIndex >= this.searchHistory.length) {
          // Back to current input
          this.searchHistoryIndex = -1;
          this.input.value = this.searchHistoryTemp;
        } else {
          this.input.value = this.searchHistory[this.searchHistoryIndex];
        }
      }
    }

    // Move cursor to end
    this.input.setSelectionRange(this.input.value.length, this.input.value.length);

    // Perform search with new value
    this.handleInput();
  }

  /**
   * Add a replace query to history
   * @param {string} query - The replace query to add
   */
  addToReplaceHistory(query) {
    // Allow empty string in replace history (valid replacement)
    if (query === undefined || query === null) return;

    // Remove duplicate if exists
    const existingIndex = this.replaceHistory.indexOf(query);
    if (existingIndex !== -1) {
      this.replaceHistory.splice(existingIndex, 1);
    }

    // Add to end of history
    this.replaceHistory.push(query);

    // Limit history length
    if (this.replaceHistory.length > this.maxHistoryLength) {
      this.replaceHistory.shift();
    }

    // Reset history index
    this.replaceHistoryIndex = -1;
    this.replaceHistoryTemp = '';

    // Persist to storage
    this.saveHistory();
  }

  /**
   * Navigate through replace history
   * @param {string} direction - 'back' or 'forward'
   */
  navigateReplaceHistory(direction) {
    if (this.replaceHistory.length === 0) return;

    // Save current input when starting to navigate
    if (this.replaceHistoryIndex === -1) {
      this.replaceHistoryTemp = this.replaceInput.value;
    }

    if (direction === 'back') {
      // Go back in history (older)
      if (this.replaceHistoryIndex === -1) {
        // Start from the most recent that's different from current input
        let startIndex = this.replaceHistory.length - 1;
        // Skip if the last history item is the same as current input
        while (startIndex >= 0 && this.replaceHistory[startIndex] === this.replaceInput.value) {
          startIndex--;
        }
        if (startIndex >= 0) {
          this.replaceHistoryIndex = startIndex;
          this.replaceInput.value = this.replaceHistory[this.replaceHistoryIndex];
        }
      } else if (this.replaceHistoryIndex > 0) {
        this.replaceHistoryIndex--;
        this.replaceInput.value = this.replaceHistory[this.replaceHistoryIndex];
      }
    } else {
      // Go forward in history (newer)
      if (this.replaceHistoryIndex !== -1) {
        this.replaceHistoryIndex++;
        if (this.replaceHistoryIndex >= this.replaceHistory.length) {
          // Back to current input
          this.replaceHistoryIndex = -1;
          this.replaceInput.value = this.replaceHistoryTemp;
        } else {
          this.replaceInput.value = this.replaceHistory[this.replaceHistoryIndex];
        }
      }
    }

    // Move cursor to end
    this.replaceInput.setSelectionRange(this.replaceInput.value.length, this.replaceInput.value.length);
  }

  /**
   * Update the mode indicator
   */
  updateModeIndicator() {
    const mode = this.searchEngine.getSearchMode();
    let modeText = '';
    let modeClass = '';

    switch (mode) {
      case 'regex':
        modeText = 'Regex';
        modeClass = 'locate-mode-regex';
        break;
      case 'css':
        modeText = 'CSS';
        modeClass = 'locate-mode-css';
        break;
      case 'xpath':
        modeText = 'XPath';
        modeClass = 'locate-mode-xpath';
        break;
      case 'mixed':
        modeText = 'CSS';
        modeClass = 'locate-mode-mixed';
        break;
      default:
        modeText = '';
        modeClass = '';
    }

    this.modeIndicator.textContent = modeText;
    this.modeIndicator.className = 'locate-mode-indicator' + (modeClass ? ' ' + modeClass : '');

    // Toggle display and padding class on input based on which badge is visible
    // Remove all badge padding classes first
    this.input.classList.remove('has-mode-badge-regex', 'has-mode-badge-css', 'has-mode-badge-xpath');

    if (mode === 'regex') {
      this.modeIndicator.style.setProperty('display', 'block', 'important');
      this.input.classList.add('has-mode-badge-regex');
    } else if (mode === 'css' || mode === 'mixed') {
      this.modeIndicator.style.setProperty('display', 'block', 'important');
      this.input.classList.add('has-mode-badge-css');
    } else if (mode === 'xpath') {
      this.modeIndicator.style.setProperty('display', 'block', 'important');
      this.input.classList.add('has-mode-badge-xpath');
    } else {
      this.modeIndicator.style.setProperty('display', 'none', 'important');
    }

    // Update toolbar button active states based on input content
    this.updateModeButtons();
  }

  /**
   * Update the regex/css/xpath button active states based on input
   */
  updateModeButtons() {
    const value = this.input.value;

    // Check if input looks like regex (but not XPath which starts with //)
    const isRegex = value.startsWith('/') && !value.startsWith('//') && !!value.match(/\/[gimsuy]*$/);
    this.regexBtn.classList.toggle('active', isRegex);
    this.regexBtn.setAttribute('aria-pressed', String(isRegex));

    // Check if input has CSS prefix or looks like a CSS selector
    const hasCSSPrefix = value.startsWith('css:') || value.startsWith('$');
    const looksLikeCSS = hasCSSPrefix || (this.searchEngine && this.searchEngine.looksLikeCSSSelector(value));
    this.cssBtn.classList.toggle('active', looksLikeCSS);
    this.cssBtn.setAttribute('aria-pressed', String(looksLikeCSS));

    // Check if input has XPath prefix
    const hasXPathPrefix = value.startsWith('xpath:') || value.startsWith('//');
    if (this.xpathBtn) {
      this.xpathBtn.classList.toggle('active', hasXPathPrefix);
      this.xpathBtn.setAttribute('aria-pressed', String(hasXPathPrefix));
    }
  }

  /**
   * Show error message
   * @param {string} message - Error message to display
   */
  showError(message) {
    this.errorMessage.textContent = message;
    this.errorMessage.style.setProperty('display', 'block', 'important');
    this.input.classList.add('has-error');
  }

  /**
   * Hide error message
   */
  hideError() {
    this.errorMessage.textContent = '';
    this.errorMessage.style.setProperty('display', 'none', 'important');
    this.input.classList.remove('has-error');
  }

  /**
   * Show hint for short queries (1-2 chars) that require Enter to search
   */
  showShortQueryHint() {
    // Clear any existing search results
    this.highlighter.clear();
    this.searchEngine.clear();

    // Just reset to default state - don't show shifting text
    this.setMatchCountText('0', ' of ', '0');
    this.matchCount.classList.remove('no-results', 'hint', 'limit-reached');
  }

  /**
   * Hide the short query hint
   */
  hideShortQueryHint() {
    this.matchCount.classList.remove('hint');
  }

  /**
   * Update the match count display with animation
   */
  updateMatchCount() {
    const current = this.searchEngine.getCurrentIndex();
    const total = this.searchEngine.getMatchCount();
    const mode = this.searchEngine.getSearchMode();
    const error = this.searchEngine.getLastError();
    const matchLimitReached = this.searchEngine.wasMatchLimitReached();

    // Check if mode badge is visible
    const hasBadge = mode === 'regex' || mode === 'css' || mode === 'xpath' || mode === 'mixed';

    // Show AI hint when there are no results, there is search text, AI is available, and no other badge is shown
    const showAiHint = total === 0 && this.input.value.length > 0 && !error && this.hasAIProvider && !hasBadge;
    if (this.aiHint) {
      this.aiHint.classList.toggle('visible', showAiHint);
      // Add padding to input when AI hint is visible
      this.input.classList.toggle('has-ai-hint', showAiHint);
    }

    // Get the span elements for animated updates
    const currentSpan = this.matchCount.querySelector('.locate-match-current');
    const separatorSpan = this.matchCount.querySelector('.locate-match-separator');
    const totalSpan = this.matchCount.querySelector('.locate-match-total');

    if (error) {
      this.setMatchCountText('Error', '', '');
      this.matchCount.classList.add('no-results');
      this.matchCount.classList.remove('hint', 'limit-reached');
    } else if (total === 0) {
      if (this.input.value.length > 0) {
        const text = (mode === 'css' || mode === 'xpath') ? '0 elements' : 'No results';
        this.setMatchCountText(text, '', '');
        this.matchCount.classList.add('no-results');
        this.matchCount.classList.remove('hint', 'limit-reached');
      } else {
        this.setMatchCountText('0', ' of ', '0');
        this.matchCount.classList.remove('no-results', 'hint', 'limit-reached');
      }
    } else {
      // Show match limit warning if we hit the cap
      if (matchLimitReached) {
        this.setMatchCountText(current, ' of ', `${total}+`);
        this.matchCount.classList.add('limit-reached');
      } else {
        this.animateMatchCountChange(current, total);
        this.matchCount.classList.remove('limit-reached');
      }
      this.matchCount.classList.remove('no-results', 'hint');
    }
  }

  /**
   * Set match count text without animation (for non-numeric states)
   */
  setMatchCountText(current, separator, total) {
    const currentSpan = this.matchCount.querySelector('.locate-match-current');
    const separatorSpan = this.matchCount.querySelector('.locate-match-separator');
    const totalSpan = this.matchCount.querySelector('.locate-match-total');

    if (currentSpan && separatorSpan && totalSpan) {
      currentSpan.textContent = current;
      separatorSpan.textContent = separator;
      totalSpan.textContent = total;
      // Remove any animation classes
      currentSpan.classList.remove('animate-up', 'animate-down');
      totalSpan.classList.remove('animate-up', 'animate-down');
    } else {
      // Fallback if spans don't exist
      this.matchCount.textContent = current + separator + total;
    }
  }

  /**
   * Animate the match count number change
   */
  animateMatchCountChange(current, total) {
    const currentSpan = this.matchCount.querySelector('.locate-match-current');
    const separatorSpan = this.matchCount.querySelector('.locate-match-separator');
    const totalSpan = this.matchCount.querySelector('.locate-match-total');

    if (!currentSpan || !separatorSpan || !totalSpan) {
      this.matchCount.textContent = `${current} of ${total}`;
      return;
    }

    // Get previous values
    const prevCurrent = parseInt(currentSpan.textContent, 10) || 0;
    const prevTotal = parseInt(totalSpan.textContent, 10) || 0;

    // Animate current number if changed
    if (prevCurrent !== current) {
      const direction = current > prevCurrent ? 'up' : 'down';
      this.animateNumberSpan(currentSpan, current, direction);
    }

    // Animate total number if changed
    if (prevTotal !== total) {
      const direction = total > prevTotal ? 'up' : 'down';
      this.animateNumberSpan(totalSpan, total, direction);
    }

    // Always ensure separator is correct
    separatorSpan.textContent = ' of ';
  }

  /**
   * Animate a single number span
   */
  animateNumberSpan(span, newValue, direction) {
    // Remove existing animation classes
    span.classList.remove('animate-up', 'animate-down');

    // Force reflow to restart animation
    void span.offsetWidth;

    // Update value and add animation class
    span.textContent = newValue;
    span.classList.add(`animate-${direction}`);

    // Remove animation class after it completes
    setTimeout(() => {
      span.classList.remove('animate-up', 'animate-down');
    }, 150);
  }

  /**
   * Go to next match
   */
  goToNext() {
    const match = this.searchEngine.nextMatch();
    if (match) {
      const mode = this.searchEngine.getSearchMode();
      this.varDumper.revealMatch(match);
      this.highlighter.updateCurrentMatch(
        this.searchEngine.matches,
        this.searchEngine.currentIndex,
        mode
      );
      this.updateMatchCount();
      this.searchEngine.scrollToCurrentMatch();
      this.highlighter.triggerSheen(match);
    }
  }

  /**
   * Go to previous match
   */
  goToPrevious() {
    const match = this.searchEngine.previousMatch();
    if (match) {
      const mode = this.searchEngine.getSearchMode();
      this.varDumper.revealMatch(match);
      this.highlighter.updateCurrentMatch(
        this.searchEngine.matches,
        this.searchEngine.currentIndex,
        mode
      );
      this.updateMatchCount();
      this.searchEngine.scrollToCurrentMatch();
      this.highlighter.triggerSheen(match);
    }
  }

  /**
   * Toggle a search option
   * @param {string} option - Option name (caseSensitive, wholeWord)
   */
  toggleOption(option) {
    this.options[option] = !this.options[option];

    // Update button state
    const btn = this.overlay.querySelector(`[data-option="${option}"]`);
    if (btn) {
      btn.classList.toggle('active', this.options[option]);
      btn.setAttribute('aria-pressed', this.options[option].toString());
    }

    // Re-run search with new options
    if (this.input.value) {
      this.performSearch();
    }
  }

  /**
   * Show the overlay
   * @param {boolean} withReplace - Whether to open in replace mode
   */
  show(withReplace = false) {
    // Close AI panel if it's open to reduce confusion
    if (this.aiPanel && this.aiPanel.isOpen()) {
      this.aiPanel.hide();
    }

    // Pre-fill with selected text on the page (if any)
    const selectedText = window.getSelection()?.toString().trim();
    if (selectedText && selectedText.length > 0 && selectedText.length < 500) {
      this.input.value = selectedText;
      // Trigger search immediately
      this.performSearch();
    }

    this.overlay.classList.add('visible');
    this.isVisible = true;

    // Open replace mode if requested
    if (withReplace && !this.replaceMode) {
      this.toggleReplaceMode();
    }

    // Focus input reliably - use multiple attempts to ensure focus
    // Some websites have scripts that may steal focus
    const focusInput = () => {
      if (this.isVisible) {
        this.input.focus({ preventScroll: true });
        this.input.select();
      }
    };

    // Immediate focus attempt
    focusInput();

    // Second attempt after a short delay (for slow-rendering pages)
    setTimeout(focusInput, 50);

    // Third attempt after CSS transition completes (200ms is typical transition time)
    setTimeout(focusInput, 220);
  }

  /**
   * Hide the overlay
   */
  hide() {
    this.overlay.classList.remove('visible');
    this.isVisible = false;
    this.searchEngine.clear();
    this.highlighter.clear();
    this.input.value = '';
    this.replaceInput.value = '';
    this.hideError();
    this.hideReplaceInfo();
    this.updateMatchCount();
    this.modeIndicator.style.setProperty('display', 'none', 'important');

    // Reset replace mode
    if (this.replaceMode) {
      this.replaceMode = false;
      this.replaceRow.style.setProperty('display', 'none', 'important');
      this.replaceToggleBtn.classList.remove('active');
      this.replaceToggleBtn.setAttribute('aria-pressed', 'false');
      this.overlay.classList.remove('replace-mode');
    }
  }

  /**
   * Toggle overlay visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if overlay is currently visible
   * @returns {boolean}
   */
  isOpen() {
    return this.isVisible;
  }

  /**
   * Destroy the overlay and clean up
   */
  destroy() {
    this.hide();
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }
}

// Export for use in other modules
window.LocateSearchOverlay = SearchOverlay;
