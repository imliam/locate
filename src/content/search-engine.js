/**
 * Search Engine - Core text search functionality using TreeWalker
 * Handles text node traversal, regex, and CSS selector matching
 */

class SearchEngine {
  constructor() {
    this.matches = [];
    this.currentIndex = -1;
    this.lastQuery = '';
    this.lastOptions = {};
    this.searchMode = 'text'; // 'text', 'regex', 'css', 'xpath'
    this.lastError = null;
    this.selectorElements = []; // For CSS and XPath selector modes
    this.searchHidden = false; // Whether to include hidden elements

    // Performance limits to prevent browser crashes on large pages
    this.MAX_MATCHES = 10000; // Stop searching after this many matches
    this.matchLimitReached = false; // Track if we hit the limit
  }

  /**
   * Detect search mode from query
   * @param {string} query - The search query
   * @returns {Object} { mode: string, pattern: string, flags: string, error: string|null }
   */
  detectSearchMode(query) {
    // Check for explicit CSS selector mode (css: or $ prefix)
    if (query.startsWith('css:') || query.startsWith('$')) {
      const selector = query.startsWith('css:') ? query.slice(4).trim() : query.slice(1).trim();
      return { mode: 'css', pattern: selector, flags: '', error: null };
    }

    // Check for explicit XPath selector mode (xpath: or // prefix)
    if (query.startsWith('xpath:')) {
      const xpath = query.slice(6).trim();
      return { mode: 'xpath', pattern: xpath, flags: '', error: null };
    }
    // XPath starting with // (common XPath pattern) - but not just "//" alone
    if (query.startsWith('//') && query.length > 2) {
      return { mode: 'xpath', pattern: query, flags: '', error: null };
    }

    // Check for regex mode (/pattern/flags)
    const regexMatch = query.match(/^\/(.+)\/([gimsuy]*)$/);
    if (regexMatch) {
      const [, pattern, flags] = regexMatch;
      // Validate the regex
      try {
        new RegExp(pattern, flags);
        return { mode: 'regex', pattern, flags, error: null };
      } catch (e) {
        return { mode: 'regex', pattern, flags, error: e.message };
      }
    }

    // Default to text mode
    return { mode: 'text', pattern: query, flags: '', error: null };
  }

  /**
   * Check if a query looks like it could be a CSS selector
   * @param {string} query - The search query
   * @returns {boolean}
   */
  looksLikeCSSSelector(query) {
    // Must have at least 2 characters
    if (query.length < 2) return false;

    // Common CSS selector patterns
    // Starts with tag name followed by class/id/attribute
    if (/^[a-z][a-z0-9]*[.#\[\:]/.test(query)) return true;

    // Starts with class selector
    if (/^\.[a-z_-][a-z0-9_-]*/i.test(query)) return true;

    // Starts with ID selector
    if (/^#[a-z_-][a-z0-9_-]*/i.test(query)) return true;

    // Attribute selector
    if (/^\[[a-z]/i.test(query)) return true;

    // Contains combinators with valid selector parts
    if (/^[a-z.#][a-z0-9._#-]*\s*[>+~]\s*[a-z.#]/i.test(query)) return true;

    // Pseudo-selectors
    if (/^[a-z.#][a-z0-9._#-]*:[a-z]/i.test(query)) return true;

    return false;
  }

  /**
   * Try to validate a CSS selector
   * @param {string} selector - The CSS selector to validate
   * @returns {boolean}
   */
  isValidCSSSelector(selector) {
    try {
      document.querySelector(selector);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Search for text in the document
   * @param {string} query - The search query
   * @param {Object} options - Search options
   * @param {boolean} options.caseSensitive - Whether search is case-sensitive
   * @param {boolean} options.wholeWord - Whether to match whole words only
   * @param {string} options.searchScope - 'all', 'input' (editable fields only), or 'visible'
   * @param {boolean} options.includeEditableFields - Whether to also search input/textarea values
   * @param {boolean} options.searchHidden - Whether to include hidden elements in search
   * @returns {Array} Array of match objects with range and text info
   */
  search(query, options = {}) {
    const { caseSensitive = false, wholeWord = false, searchScope = 'all', includeEditableFields = false, searchHidden = false } = options;

    // Store searchHidden for use in visibility checks
    this.searchHidden = searchHidden;

    // Clear previous matches
    this.matches = [];
    this.selectorElements = [];
    this.currentIndex = -1;
    this.lastError = null;
    this.matchLimitReached = false;

    if (!query || query.length === 0) {
      this.searchMode = 'text';
      return this.matches;
    }

    this.lastQuery = query;
    this.lastOptions = options;

    // Detect search mode
    const { mode, pattern, flags, error } = this.detectSearchMode(query);
    this.searchMode = mode;

    if (error) {
      this.lastError = error;
      return this.matches;
    }

    // Handle different search modes
    switch (mode) {
      case 'css':
        return this.searchCSS(pattern);
      case 'xpath':
        return this.searchXPath(pattern);
      case 'regex':
        // For regex, also search editable fields if scope is 'input'
        if (searchScope === 'input') {
          return this.searchEditableFields(pattern, { caseSensitive, wholeWord, isRegex: true, regexFlags: flags });
        }
        // Also search editable fields if includeEditableFields is true
        const regexMatches = this.searchRegex(pattern, flags);
        if (includeEditableFields) {
          this.searchEditableFields(pattern, { caseSensitive, wholeWord, isRegex: true, regexFlags: flags });
        }
        if (this.matches.length > 0 && this.currentIndex === -1) {
          this.currentIndex = 0;
        }
        return this.matches;
      default:
        // If searchScope is 'input', only search editable fields
        if (searchScope === 'input') {
          this.searchEditableFields(pattern, { caseSensitive, wholeWord });
          if (this.matches.length > 0) {
            this.currentIndex = 0;
          }
          return this.matches;
        }

        // For text mode, also try CSS selector if the query looks like one
        const textMatches = this.searchText(pattern, caseSensitive, wholeWord);

        // Also search editable fields if includeEditableFields is true
        if (includeEditableFields) {
          this.searchEditableFields(pattern, { caseSensitive, wholeWord });
        }

        // If query looks like a CSS selector and is valid, also search for CSS matches
        if (this.looksLikeCSSSelector(query) && this.isValidCSSSelector(query)) {
          // Update mode to indicate mixed search (even if no CSS matches found)
          this.searchMode = 'mixed';

          // Save text matches
          const savedTextMatches = [...this.matches];
          const savedSelectorElements = [...this.selectorElements];

          // Search for CSS matches
          this.matches = [];
          this.selectorElements = [];
          this.searchCSS(query);

          // Combine results: CSS matches first, then text matches
          const cssMatches = this.matches;
          const selectorElements = this.selectorElements;

          // Merge: CSS elements followed by text matches
          this.matches = [...cssMatches, ...savedTextMatches];
          this.selectorElements = selectorElements;
        }

        if (this.matches.length > 0) {
          this.currentIndex = 0;
        }

        return this.matches;
    }
  }

  /**
   * Search inside editable fields (input, textarea, contenteditable)
   * @param {string} query - The search query
   * @param {Object} options - Search options
   * @returns {Array} Array of match objects
   */
  searchEditableFields(query, options = {}) {
    const { caseSensitive = false, wholeWord = false, isRegex = false, regexFlags = '' } = options;

    // Search in input[type="text"], input[type="search"], input[type="email"], etc.
    const textInputTypes = ['text', 'search', 'email', 'url', 'tel', 'password'];
    const inputSelector = textInputTypes.map(t => `input[type="${t}"]`).join(', ') + ', input:not([type])';

    // Get all editable elements
    const inputs = document.querySelectorAll(inputSelector);
    const textareas = document.querySelectorAll('textarea');
    const contenteditables = document.querySelectorAll('[contenteditable="true"], [contenteditable=""]');

    // Search inputs
    inputs.forEach(input => {
      if (!this.searchHidden && !this.isElementVisible(input)) return;
      if (input.closest('#locate-overlay')) return;
      this.searchInValue(input, input.value, query, { caseSensitive, wholeWord, isRegex, regexFlags, type: 'input' });
    });

    // Search textareas
    textareas.forEach(textarea => {
      if (!this.searchHidden && !this.isElementVisible(textarea)) return;
      if (textarea.closest('#locate-overlay')) return;
      this.searchInValue(textarea, textarea.value, query, { caseSensitive, wholeWord, isRegex, regexFlags, type: 'textarea' });
    });

    // Search contenteditable - these have text nodes so we use a different approach
    contenteditables.forEach(el => {
      if (!this.searchHidden && !this.isElementVisible(el)) return;
      if (el.closest('#locate-overlay')) return;
      // For contenteditable, search text nodes within
      this.searchInContentEditable(el, query, { caseSensitive, wholeWord, isRegex, regexFlags });
    });

    return this.matches;
  }

  /**
   * Search within an element's value (for input/textarea)
   * @param {Element} element - The input/textarea element
   * @param {string} value - The value to search in
   * @param {string} query - The search query
   * @param {Object} options - Search options
   */
  searchInValue(element, value, query, options = {}) {
    const { caseSensitive = false, wholeWord = false, isRegex = false, regexFlags = '', type = 'input' } = options;

    if (!value) return;

    // Check match limit
    if (this.matches.length >= this.MAX_MATCHES) {
      this.matchLimitReached = true;
      return;
    }

    const searchValue = caseSensitive ? value : value.toLowerCase();
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    if (isRegex) {
      // Regex search
      let flags = regexFlags;
      if (!flags.includes('g')) flags += 'g';

      try {
        const regex = new RegExp(query, flags);
        let match;

        while ((match = regex.exec(value)) !== null) {
          if (this.matches.length >= this.MAX_MATCHES) {
            this.matchLimitReached = true;
            break;
          }

          if (match[0].length === 0) {
            regex.lastIndex++;
            continue;
          }

          this.matches.push({
            element,
            text: match[0],
            startOffset: match.index,
            endOffset: match.index + match[0].length,
            type: type,
            isEditableField: true,
            groups: match.slice(1)
          });
        }
      } catch (e) {
        // Invalid regex, skip
      }
    } else {
      // Plain text search
      let startIndex = 0;
      let matchIndex;

      while ((matchIndex = searchValue.indexOf(searchQuery, startIndex)) !== -1) {
        if (this.matches.length >= this.MAX_MATCHES) {
          this.matchLimitReached = true;
          break;
        }

        // Check whole word boundary if needed
        if (wholeWord) {
          const beforeChar = searchValue[matchIndex - 1];
          const afterChar = searchValue[matchIndex + searchQuery.length];
          const isWordBoundaryBefore = !beforeChar || /\W/.test(beforeChar);
          const isWordBoundaryAfter = !afterChar || /\W/.test(afterChar);

          if (!isWordBoundaryBefore || !isWordBoundaryAfter) {
            startIndex = matchIndex + 1;
            continue;
          }
        }

        this.matches.push({
          element,
          text: value.substring(matchIndex, matchIndex + query.length),
          startOffset: matchIndex,
          endOffset: matchIndex + query.length,
          type: type,
          isEditableField: true
        });

        startIndex = matchIndex + 1;
      }
    }
  }

  /**
   * Search within a contenteditable element
   * @param {Element} element - The contenteditable element
   * @param {string} query - The search query
   * @param {Object} options - Search options
   */
  searchInContentEditable(element, query, options = {}) {
    const { caseSensitive = false, wholeWord = false, isRegex = false, regexFlags = '' } = options;

    // Create a TreeWalker scoped to this element
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      // Check match limit
      if (this.matches.length >= this.MAX_MATCHES) {
        this.matchLimitReached = true;
        break;
      }

      const text = node.textContent;

      if (isRegex) {
        let flags = regexFlags;
        if (!flags.includes('g')) flags += 'g';

        try {
          const regex = new RegExp(query, flags);
          let match;

          while ((match = regex.exec(text)) !== null) {
            if (this.matches.length >= this.MAX_MATCHES) {
              this.matchLimitReached = true;
              break;
            }

            if (match[0].length === 0) {
              regex.lastIndex++;
              continue;
            }

            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);

            this.matches.push({
              range,
              node,
              element,
              text: match[0],
              startOffset: match.index,
              endOffset: match.index + match[0].length,
              type: 'contenteditable',
              isEditableField: true,
              groups: match.slice(1)
            });
          }
        } catch (e) {
          // Invalid regex
        }
      } else {
        const searchText = caseSensitive ? text : text.toLowerCase();
        const searchQuery = caseSensitive ? query : query.toLowerCase();

        let startIndex = 0;
        let matchIndex;

        while ((matchIndex = searchText.indexOf(searchQuery, startIndex)) !== -1) {
          if (this.matches.length >= this.MAX_MATCHES) {
            this.matchLimitReached = true;
            break;
          }

          if (wholeWord) {
            const beforeChar = searchText[matchIndex - 1];
            const afterChar = searchText[matchIndex + searchQuery.length];
            const isWordBoundaryBefore = !beforeChar || /\\W/.test(beforeChar);
            const isWordBoundaryAfter = !afterChar || /\\W/.test(afterChar);

            if (!isWordBoundaryBefore || !isWordBoundaryAfter) {
              startIndex = matchIndex + 1;
              continue;
            }
          }

          const range = document.createRange();
          range.setStart(node, matchIndex);
          range.setEnd(node, matchIndex + query.length);

          this.matches.push({
            range,
            node,
            element,
            text: text.substring(matchIndex, matchIndex + query.length),
            startOffset: matchIndex,
            endOffset: matchIndex + query.length,
            type: 'contenteditable',
            isEditableField: true
          });

          startIndex = matchIndex + 1;
        }
      }
    }
  }

  /**
   * Search using plain text
   * @param {string} query - The search query
   * @param {boolean} caseSensitive - Whether search is case-sensitive
   * @param {boolean} wholeWord - Whether to match whole words only
   * @returns {Array} Array of match objects
   */
  searchText(query, caseSensitive, wholeWord) {
    const walker = this.createTextWalker();
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    let node;

    while ((node = walker.nextNode())) {
      // Check match limit to prevent browser hangs
      if (this.matches.length >= this.MAX_MATCHES) {
        this.matchLimitReached = true;
        break;
      }

      const text = node.textContent;
      const searchText = caseSensitive ? text : text.toLowerCase();

      let startIndex = 0;
      let matchIndex;

      while ((matchIndex = searchText.indexOf(searchQuery, startIndex)) !== -1) {
        // Check match limit inside inner loop too
        if (this.matches.length >= this.MAX_MATCHES) {
          this.matchLimitReached = true;
          break;
        }

        // Check whole word boundary if needed
        if (wholeWord) {
          const beforeChar = searchText[matchIndex - 1];
          const afterChar = searchText[matchIndex + searchQuery.length];
          const isWordBoundaryBefore = !beforeChar || /\W/.test(beforeChar);
          const isWordBoundaryAfter = !afterChar || /\W/.test(afterChar);

          if (!isWordBoundaryBefore || !isWordBoundaryAfter) {
            startIndex = matchIndex + 1;
            continue;
          }
        }

        // Create a Range for this match
        const range = document.createRange();
        range.setStart(node, matchIndex);
        range.setEnd(node, matchIndex + query.length);

        this.matches.push({
          range,
          node,
          text: text.substring(matchIndex, matchIndex + query.length),
          startOffset: matchIndex,
          endOffset: matchIndex + query.length,
          type: 'text'
        });

        startIndex = matchIndex + 1;
      }
    }

    if (this.matches.length > 0) {
      this.currentIndex = 0;
    }

    return this.matches;
  }

  /**
   * Search using regular expression
   * @param {string} pattern - The regex pattern
   * @param {string} flags - The regex flags
   * @returns {Array} Array of match objects
   */
  searchRegex(pattern, flags) {
    // Add 'g' flag if not present for global matching
    let regexFlags = flags;
    if (!regexFlags.includes('g')) {
      regexFlags += 'g';
    }
    // Regex is case-sensitive by default - user can add 'i' flag for case-insensitive

    let regex;
    try {
      regex = new RegExp(pattern, regexFlags);
    } catch (e) {
      this.lastError = e.message;
      return this.matches;
    }

    const walker = this.createTextWalker();
    let node;

    while ((node = walker.nextNode())) {
      // Check match limit to prevent browser hangs
      if (this.matches.length >= this.MAX_MATCHES) {
        this.matchLimitReached = true;
        break;
      }

      const text = node.textContent;
      let match;

      // Reset regex lastIndex for each node
      regex.lastIndex = 0;

      while ((match = regex.exec(text)) !== null) {
        // Check match limit inside inner loop too
        if (this.matches.length >= this.MAX_MATCHES) {
          this.matchLimitReached = true;
          break;
        }

        // Prevent infinite loops on zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
          continue;
        }

        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);

        this.matches.push({
          range,
          node,
          text: match[0],
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          type: 'regex',
          groups: match.slice(1) // Capture groups
        });
      }
    }

    if (this.matches.length > 0) {
      this.currentIndex = 0;
    }

    return this.matches;
  }

  /**
   * Search using CSS selector
   * @param {string} selector - The CSS selector
   * @returns {Array} Array of match objects (element-based)
   */
  searchCSS(selector) {
    if (!selector) {
      return this.matches;
    }

    try {
      const elements = document.querySelectorAll(selector);

      elements.forEach((element, index) => {
        // Skip our own overlay
        if (element.closest('#locate-overlay')) {
          return;
        }

        // Skip visibility checks if searchHidden is enabled
        if (!this.searchHidden) {
          // Skip hidden elements using comprehensive visibility check
          if (!this.isElementVisible(element)) {
            return;
          }

          // Skip elements inside closed <details>
          const details = element.closest('details');
          if (details && !details.open && !element.closest('summary')) {
            return;
          }

          // Skip aria-hidden elements
          if (element.closest('[aria-hidden="true"]')) {
            return;
          }
        }

        // Store element reference
        this.selectorElements.push(element);

        // Create a virtual match object for CSS elements
        this.matches.push({
          element,
          node: element,
          text: element.tagName.toLowerCase() + (element.id ? `#${element.id}` : '') +
                (element.className && typeof element.className === 'string'
                  ? `.${element.className.trim().split(/\s+/).join('.')}` : ''),
          type: 'css',
          index: this.matches.length
        });
      });

      if (this.matches.length > 0) {
        this.currentIndex = 0;
      }
    } catch (e) {
      this.lastError = `Invalid CSS selector: ${e.message}`;
    }

    return this.matches;
  }

  /**
   * Search using XPath expression
   * @param {string} xpath - The XPath expression
   * @returns {Array} Array of match objects (element-based)
   */
  searchXPath(xpath) {
    if (!xpath) {
      return this.matches;
    }

    try {
      const result = document.evaluate(
        xpath,
        document.body,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      for (let i = 0; i < result.snapshotLength; i++) {
        // Check match limit
        if (this.matches.length >= this.MAX_MATCHES) {
          this.matchLimitReached = true;
          break;
        }

        const node = result.snapshotItem(i);

        // Handle different node types
        let element;
        if (node.nodeType === Node.ELEMENT_NODE) {
          element = node;
        } else if (node.nodeType === Node.TEXT_NODE) {
          element = node.parentElement;
        } else if (node.nodeType === Node.ATTRIBUTE_NODE) {
          element = node.ownerElement;
        } else {
          continue; // Skip other node types
        }

        if (!element) continue;

        // Skip our own overlay
        if (element.closest('#locate-overlay')) {
          continue;
        }

        // Skip visibility checks if searchHidden is enabled
        if (!this.searchHidden) {
          // Skip hidden elements using comprehensive visibility check
          if (!this.isElementVisible(element)) {
            continue;
          }

          // Skip elements inside closed <details>
          const details = element.closest('details');
          if (details && !details.open && !element.closest('summary')) {
            continue;
          }

          // Skip aria-hidden elements
          if (element.closest('[aria-hidden="true"]')) {
            continue;
          }
        }

        // Store element reference
        this.selectorElements.push(element);

        // Create description text based on node type
        let text;
        if (node.nodeType === Node.TEXT_NODE) {
          text = `text: "${node.textContent.substring(0, 50)}${node.textContent.length > 50 ? '...' : ''}"`;
        } else if (node.nodeType === Node.ATTRIBUTE_NODE) {
          text = `@${node.name}="${node.value}"`;
        } else {
          text = element.tagName.toLowerCase() + (element.id ? `#${element.id}` : '') +
                 (element.className && typeof element.className === 'string'
                   ? `.${element.className.trim().split(/\s+/).join('.')}` : '');
        }

        // Create a virtual match object for XPath elements
        this.matches.push({
          element,
          node: node,
          text,
          type: 'xpath',
          index: this.matches.length
        });
      }

      if (this.matches.length > 0) {
        this.currentIndex = 0;
      }
    } catch (e) {
      this.lastError = `Invalid XPath expression: ${e.message}`;
    }

    return this.matches;
  }

  /**
   * Check if an element is truly visible (not just CSS visible, but actually rendered)
   * @param {Element} element - The element to check
   * @returns {boolean} Whether the element is visible
   */
  isElementVisible(element) {
    if (!element) return false;

    // If searchHidden is enabled, consider all elements as visible
    if (this.searchHidden) return true;

    // Check if element or any ancestor has display: none, visibility: hidden, or opacity: 0
    let current = element;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);

      if (style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0') {
        return false;
      }

      // Check for elements hidden by clip/clip-path
      if (style.clip === 'rect(0px, 0px, 0px, 0px)' ||
          style.clipPath === 'inset(100%)') {
        return false;
      }

      // Check for zero-size elements (common hiding technique)
      if (current.offsetWidth === 0 && current.offsetHeight === 0) {
        // Allow inline elements that might have zero box dimensions
        if (style.display !== 'inline' && style.display !== 'inline-block') {
          return false;
        }
      }

      current = current.parentElement;
    }

    // Check if element has actual dimensions or is inline
    const rect = element.getBoundingClientRect();
    const hasSize = rect.width > 0 || rect.height > 0;
    const style = window.getComputedStyle(element);
    const isInline = style.display === 'inline';

    return hasSize || isInline;
  }

  /**
   * Create a TreeWalker for text node traversal
   * @returns {TreeWalker}
   */
  createTextWalker() {
    const self = this;
    return document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const tagName = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'template'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip our own overlay
          if (parent.closest('#locate-overlay')) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip visibility checks if searchHidden is enabled
          if (!self.searchHidden) {
            // Skip elements hidden with aria-hidden
            if (parent.closest('[aria-hidden="true"]')) {
              return NodeFilter.FILTER_REJECT;
            }

            // Skip elements inside <details> that are not open
            const details = parent.closest('details');
            if (details && !details.open && !parent.closest('summary')) {
              return NodeFilter.FILTER_REJECT;
            }

            // Check if the element is truly visible
            if (!self.isElementVisible(parent)) {
              return NodeFilter.FILTER_REJECT;
            }
          }

          if (!node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
  }

  /**
   * Get the current match
   * @returns {Object|null} Current match object or null
   */
  getCurrentMatch() {
    if (this.currentIndex >= 0 && this.currentIndex < this.matches.length) {
      return this.matches[this.currentIndex];
    }
    return null;
  }

  /**
   * Move to the next match
   * @returns {Object|null} Next match object or null
   */
  nextMatch() {
    if (this.matches.length === 0) return null;

    this.currentIndex = (this.currentIndex + 1) % this.matches.length;
    return this.getCurrentMatch();
  }

  /**
   * Move to the previous match
   * @returns {Object|null} Previous match object or null
   */
  previousMatch() {
    if (this.matches.length === 0) return null;

    this.currentIndex = (this.currentIndex - 1 + this.matches.length) % this.matches.length;
    return this.getCurrentMatch();
  }

  /**
   * Go to a specific match by index
   * @param {number} index - Match index
   * @returns {Object|null} Match object or null
   */
  goToMatch(index) {
    if (index >= 0 && index < this.matches.length) {
      this.currentIndex = index;
      return this.getCurrentMatch();
    }
    return null;
  }

  /**
   * Get match count
   * @returns {number} Total number of matches
   */
  getMatchCount() {
    return this.matches.length;
  }

  /**
   * Get current match index (1-based for display)
   * @returns {number} Current match index (1-based) or 0 if no matches
   */
  getCurrentIndex() {
    return this.matches.length > 0 ? this.currentIndex + 1 : 0;
  }

  /**
   * Get current search mode
   * @returns {string} Current search mode ('text', 'regex', 'css', 'xpath')
   */
  getSearchMode() {
    return this.searchMode;
  }

  /**
   * Get last error message
   * @returns {string|null} Error message or null
   */
  getLastError() {
    return this.lastError;
  }

  /**
   * Check if match limit was reached
   * @returns {boolean} Whether the max match limit was hit
   */
  wasMatchLimitReached() {
    return this.matchLimitReached;
  }

  /**
   * Get selector elements (CSS/XPath) for the current search
   * @returns {Array} Array of DOM elements
   */
  getSelectorElements() {
    return this.selectorElements;
  }

  /**
   * Clear all matches
   */
  clear() {
    this.matches = [];
    this.selectorElements = [];
    this.currentIndex = -1;
    this.lastQuery = '';
    this.lastOptions = {};
    this.searchMode = 'text';
    this.lastError = null;
    this.matchLimitReached = false;
  }

  /**
   * Scroll the current match into view
   */
  scrollToCurrentMatch() {
    const match = this.getCurrentMatch();
    if (!match) return;

    let element;
    let rect;

    if (match.type === 'css' || match.type === 'xpath') {
      // CSS/XPath selector match - scroll to element
      element = match.element;
      rect = element.getBoundingClientRect();
    } else if (match.range) {
      // Text/regex match - scroll to range
      rect = match.range.getBoundingClientRect();
      element = match.node.parentElement;
    }

    if (!rect || !element) return;

    const isInViewport = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );

    if (!isInViewport) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }
}

// Export for use in other modules
window.LocateSearchEngine = SearchEngine;
