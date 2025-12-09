/**
 * Highlighter - CSS Custom Highlight API implementation
 * Handles visual highlighting of search matches and CSS selector elements
 */

class Highlighter {
  constructor() {
    this.highlightName = 'locate-search-highlight';
    this.currentHighlightName = 'locate-current-highlight';
    this.highlight = null;
    this.currentHighlight = null;
    this.styleInjected = false;
    this.cssOverlays = []; // For CSS selector highlighting
    this.currentCSSOverlay = null;
    this.scrollbarMarkers = []; // For scrollbar position markers
    this.scrollbarContainer = null;
    this.editableHighlights = []; // For input/textarea/contenteditable highlighting

    this.init();
  }

  /**
   * Initialise the highlighter and inject styles
   */
  init() {
    // Check if CSS Custom Highlight API is supported
    if (!CSS.highlights) {
      console.warn('Locate: CSS Custom Highlight API not supported in this browser');
      return;
    }

    this.injectStyles();
  }

  /**
   * Inject highlight styles into the document
   */
  injectStyles() {
    if (this.styleInjected) return;

    const style = document.createElement('style');
    style.id = 'locate-highlight-styles';
    style.textContent = `
      ::highlight(${this.highlightName}) {
        background-color: rgba(255, 235, 59, 0.6);
        color: inherit;
      }

      ::highlight(${this.currentHighlightName}) {
        background-color: rgba(255, 152, 0, 0.8);
        color: inherit;
      }

      /* CSS Selector element highlighting */
      .locate-css-highlight {
        outline: 2px solid rgba(138, 180, 248, 0.8) !important;
        outline-offset: 2px !important;
        background-color: rgba(138, 180, 248, 0.1) !important;
        transition: outline-color 0.15s ease, background-color 0.15s ease !important;
      }

      .locate-css-highlight-current {
        outline: 3px solid rgba(255, 152, 0, 0.9) !important;
        outline-offset: 2px !important;
        background-color: rgba(255, 152, 0, 0.15) !important;
      }

      /* CSS Element info tooltip */
      .locate-css-tooltip {
        position: absolute;
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        font-size: 11px;
        font-family: monospace;
        border-radius: 4px;
        white-space: nowrap;
        z-index: 2147483646;
        pointer-events: none;
        max-width: 300px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Scrollbar markers container */
      .locate-scrollbar-markers {
        position: fixed;
        top: 0;
        right: 0;
        width: 12px;
        height: 100vh;
        pointer-events: none;
        z-index: 9999999;
      }

      /* Individual scrollbar marker */
      .locate-scrollbar-marker {
        position: absolute;
        right: 2px;
        width: 8px;
        height: 3px;
        background-color: rgba(255, 235, 59, 0.8);
        border-radius: 1px;
        pointer-events: none;
      }

      .locate-scrollbar-marker.current {
        background-color: rgba(255, 152, 0, 1);
        height: 4px;
      }

      /* Editable field highlighting (input/textarea/contenteditable) */
      .locate-editable-has-match {
        outline: 2px solid rgba(255, 235, 59, 0.8) !important;
        outline-offset: 1px !important;
        background-color: rgba(255, 235, 59, 0.15) !important;
      }

      .locate-editable-current-match {
        outline: 3px solid rgba(255, 152, 0, 0.9) !important;
        outline-offset: 1px !important;
        background-color: rgba(255, 152, 0, 0.25) !important;
      }
    `;

    document.head.appendChild(style);
    this.styleInjected = true;
  }

  /**
   * Highlight all matches
   * @param {Array} matches - Array of match objects from SearchEngine
   * @param {number} currentIndex - Index of the current/focused match
   * @param {string} mode - Search mode ('text', 'regex', 'css', 'xpath', 'mixed')
   * @param {boolean} focusCurrent - Whether to focus the current match element (default: false)
   */
  highlightMatches(matches, currentIndex = 0, mode = 'text', focusCurrent = false) {
    // Clear existing highlights
    this.clear();

    if (!matches || matches.length === 0) return;

    if (mode === 'css' || mode === 'xpath') {
      this.highlightCSSElements(matches, currentIndex);
    } else if (mode === 'mixed') {
      // Mixed mode: highlight both CSS elements and text ranges
      this.highlightMixedMatches(matches, currentIndex);
    } else {
      // Separate editable field matches from regular text matches
      const editableMatches = matches.filter(m => m.isEditableField);
      const textMatches = matches.filter(m => !m.isEditableField);

      // Highlight text matches using CSS Highlight API
      if (textMatches.length > 0) {
        // Find current index within text matches if current match is a text match
        const currentMatch = matches[currentIndex];
        const textCurrentIndex = currentMatch && !currentMatch.isEditableField
          ? textMatches.indexOf(currentMatch)
          : -1;
        this.highlightTextRanges(textMatches, textCurrentIndex);
      }

      // Highlight editable field matches
      if (editableMatches.length > 0) {
        const currentMatch = matches[currentIndex];
        const editableCurrentIndex = currentMatch && currentMatch.isEditableField
          ? editableMatches.indexOf(currentMatch)
          : -1;
        this.highlightEditableMatches(editableMatches, editableCurrentIndex, focusCurrent);
      }
    }

    // Update scrollbar markers
    this.updateScrollbarMarkers(matches, currentIndex);
  }

  /**
   * Highlight matches in editable fields (input, textarea, contenteditable)
   * @param {Array} matches - Array of match objects
   * @param {number} currentIndex - Index of the current match
   * @param {boolean} focusCurrent - Whether to focus the current match element
   */
  highlightEditableMatches(matches, currentIndex, focusCurrent = false) {
    // For contenteditable, we can use CSS Highlight API
    // For input/textarea, we highlight the element and select text in the current one

    const ranges = [];
    const currentRanges = [];

    matches.forEach((match, index) => {
      if (match.type === 'contenteditable' && match.range) {
        // Use CSS Highlight API for contenteditable
        if (index === currentIndex) {
          currentRanges.push(match.range);
        } else {
          ranges.push(match.range);
        }
      } else if (match.type === 'input' || match.type === 'textarea') {
        // For input/textarea, add a visual indicator class
        if (match.element) {
          match.element.classList.add('locate-editable-has-match');
          this.cssOverlays.push(match.element);

          if (index === currentIndex) {
            match.element.classList.add('locate-editable-current-match');
            // Only focus and select text when explicitly navigating
            if (focusCurrent) {
              match.element.focus();
              match.element.setSelectionRange(match.startOffset, match.endOffset);
            }
          }
        }
      }
    });

    // Apply CSS highlights for contenteditable matches
    if (CSS.highlights) {
      if (ranges.length > 0) {
        this.highlight = new Highlight(...ranges);
        CSS.highlights.set(this.highlightName, this.highlight);
      }

      if (currentRanges.length > 0) {
        this.currentHighlight = new Highlight(...currentRanges);
        CSS.highlights.set(this.currentHighlightName, this.currentHighlight);
      }
    }
  }

  /**
   * Highlight mixed matches (both CSS elements and text ranges)
   * @param {Array} matches - Array of match objects
   * @param {number} currentIndex - Index of the current match
   */
  highlightMixedMatches(matches, currentIndex) {
    // Handle text ranges using CSS Custom Highlight API
    if (CSS.highlights) {
      const ranges = [];
      const currentRanges = [];

      matches.forEach((match, index) => {
        if (match.range) {
          if (index === currentIndex) {
            currentRanges.push(match.range);
          } else {
            ranges.push(match.range);
          }
        }
      });

      if (ranges.length > 0) {
        this.highlight = new Highlight(...ranges);
        CSS.highlights.set(this.highlightName, this.highlight);
      }

      if (currentRanges.length > 0) {
        this.currentHighlight = new Highlight(...currentRanges);
        CSS.highlights.set(this.currentHighlightName, this.currentHighlight);
      }
    }

    // Handle CSS elements
    matches.forEach((match, index) => {
      if (match.element) {
        if (index === currentIndex) {
          match.element.classList.add('locate-css-highlight', 'locate-css-highlight-current');
        } else {
          match.element.classList.add('locate-css-highlight');
        }
        this.cssOverlays.push(match.element);
      }
    });
  }

  /**
   * Highlight text ranges using CSS Custom Highlight API
   * Uses chunked processing for better performance with many matches
   * @param {Array} matches - Array of match objects with ranges
   * @param {number} currentIndex - Index of the current match
   */
  highlightTextRanges(matches, currentIndex) {
    if (!CSS.highlights) return;

    // Limit highlights for extreme cases to prevent browser slowdown
    // The CSS Highlight API can handle many ranges, but there's a practical limit
    const MAX_HIGHLIGHTS = 10000;
    const limitedMatches = matches.length > MAX_HIGHLIGHTS
      ? matches.slice(0, MAX_HIGHLIGHTS)
      : matches;

    const ranges = [];
    const currentRanges = [];

    limitedMatches.forEach((match, index) => {
      if (match.range) {
        if (index === currentIndex) {
          currentRanges.push(match.range);
        } else {
          ranges.push(match.range);
        }
      }
    });

    if (ranges.length > 0) {
      this.highlight = new Highlight(...ranges);
      CSS.highlights.set(this.highlightName, this.highlight);
    }

    if (currentRanges.length > 0) {
      this.currentHighlight = new Highlight(...currentRanges);
      CSS.highlights.set(this.currentHighlightName, this.currentHighlight);
    }
  }

  /**
   * Highlight CSS/XPath selector matched elements
   * @param {Array} matches - Array of match objects with elements
   * @param {number} currentIndex - Index of the current match
   */
  highlightCSSElements(matches, currentIndex) {
    matches.forEach((match, index) => {
      if (match.element) {
        if (index === currentIndex) {
          match.element.classList.add('locate-css-highlight', 'locate-css-highlight-current');
        } else {
          match.element.classList.add('locate-css-highlight');
        }
        this.cssOverlays.push(match.element);
      }
    });
  }

  /**
   * Update only the current match highlight (more efficient for navigation)
   * @param {Array} matches - Array of match objects
   * @param {number} newCurrentIndex - New current match index
   * @param {string} mode - Search mode ('text', 'regex', 'css', 'xpath', 'mixed')
   */
  updateCurrentMatch(matches, newCurrentIndex, mode = 'text') {
    if (!matches || matches.length === 0) return;

    if (mode === 'css' || mode === 'xpath') {
      this.updateCurrentCSSElement(matches, newCurrentIndex);
    } else if (mode === 'mixed') {
      this.updateCurrentMixedMatch(matches, newCurrentIndex);
    } else {
      const currentMatch = matches[newCurrentIndex];

      // Update editable field highlights
      const editableMatches = matches.filter(m => m.isEditableField);
      if (editableMatches.length > 0) {
        const editableCurrentIndex = currentMatch && currentMatch.isEditableField
          ? editableMatches.indexOf(currentMatch)
          : -1;
        this.updateCurrentEditableMatch(editableMatches, editableCurrentIndex);
      }

      // Update text highlights
      const textMatches = matches.filter(m => !m.isEditableField);
      if (textMatches.length > 0) {
        const textCurrentIndex = currentMatch && !currentMatch.isEditableField
          ? textMatches.indexOf(currentMatch)
          : -1;
        this.updateCurrentTextRange(textMatches, textCurrentIndex);
      }
    }

    // Update scrollbar marker highlights
    this.updateScrollbarMarkerHighlight(newCurrentIndex);
  }

  /**
   * Update current editable field match highlight (and focus it)
   * @param {Array} matches - Array of match objects
   * @param {number} newCurrentIndex - New current match index
   */
  updateCurrentEditableMatch(matches, newCurrentIndex) {
    // Remove current highlight class from all editable elements
    matches.forEach((match, index) => {
      if ((match.type === 'input' || match.type === 'textarea') && match.element) {
        match.element.classList.remove('locate-editable-current-match');
      }
    });

    // Add current highlight to the new current match (without focusing)
    const currentMatch = matches[newCurrentIndex];
    if (currentMatch && (currentMatch.type === 'input' || currentMatch.type === 'textarea') && currentMatch.element) {
      currentMatch.element.classList.add('locate-editable-current-match');
      // Scroll the element into view without focusing
      currentMatch.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (currentMatch && currentMatch.type === 'contenteditable' && currentMatch.range) {
      // For contenteditable, update CSS highlights
      this.updateCurrentTextRange(matches, newCurrentIndex);
    }
  }

  /**
   * Update which scrollbar marker is highlighted as current
   * @param {number} currentIndex - Current match index
   */
  updateScrollbarMarkerHighlight(currentIndex) {
    this.scrollbarMarkers.forEach((marker, index) => {
      if (index === currentIndex) {
        marker.classList.add('current');
      } else {
        marker.classList.remove('current');
      }
    });
  }

  /**
   * Update current text range highlight
   * @param {Array} matches - Array of match objects
   * @param {number} newCurrentIndex - New current match index
   */
  updateCurrentTextRange(matches, newCurrentIndex) {
    if (!CSS.highlights) return;

    const ranges = [];
    const currentRanges = [];

    matches.forEach((match, index) => {
      if (match.range) {
        if (index === newCurrentIndex) {
          currentRanges.push(match.range);
        } else {
          ranges.push(match.range);
        }
      }
    });

    CSS.highlights.delete(this.highlightName);
    CSS.highlights.delete(this.currentHighlightName);

    if (ranges.length > 0) {
      this.highlight = new Highlight(...ranges);
      CSS.highlights.set(this.highlightName, this.highlight);
    }

    if (currentRanges.length > 0) {
      this.currentHighlight = new Highlight(...currentRanges);
      CSS.highlights.set(this.currentHighlightName, this.currentHighlight);
    }
  }

  /**
   * Update current CSS element highlight
   * @param {Array} matches - Array of match objects
   * @param {number} newCurrentIndex - New current match index
   */
  updateCurrentCSSElement(matches, newCurrentIndex) {
    // Remove current highlight from all
    this.cssOverlays.forEach(el => {
      el.classList.remove('locate-css-highlight-current');
    });

    // Add current highlight to new current
    if (matches[newCurrentIndex] && matches[newCurrentIndex].element) {
      matches[newCurrentIndex].element.classList.add('locate-css-highlight-current');
    }
  }

  /**
   * Update current match highlight for mixed mode
   * @param {Array} matches - Array of match objects
   * @param {number} newCurrentIndex - New current match index
   */
  updateCurrentMixedMatch(matches, newCurrentIndex) {
    // Update text ranges
    if (CSS.highlights) {
      const ranges = [];
      const currentRanges = [];

      matches.forEach((match, index) => {
        if (match.range) {
          if (index === newCurrentIndex) {
            currentRanges.push(match.range);
          } else {
            ranges.push(match.range);
          }
        }
      });

      CSS.highlights.delete(this.highlightName);
      CSS.highlights.delete(this.currentHighlightName);

      if (ranges.length > 0) {
        this.highlight = new Highlight(...ranges);
        CSS.highlights.set(this.highlightName, this.highlight);
      }

      if (currentRanges.length > 0) {
        this.currentHighlight = new Highlight(...currentRanges);
        CSS.highlights.set(this.currentHighlightName, this.currentHighlight);
      }
    }

    // Update CSS elements
    this.cssOverlays.forEach(el => {
      el.classList.remove('locate-css-highlight-current');
    });

    if (matches[newCurrentIndex] && matches[newCurrentIndex].element) {
      matches[newCurrentIndex].element.classList.add('locate-css-highlight-current');
    }
  }

  /**
   * Show tooltip for CSS element
   * @param {Element} element - The element to show tooltip for
   * @param {string} text - The tooltip text
   */
  showCSSTooltip(element, text) {
    this.hideCSSTooltip();

    const rect = element.getBoundingClientRect();
    const tooltip = document.createElement('div');
    tooltip.className = 'locate-css-tooltip';
    tooltip.textContent = text;
    tooltip.style.setProperty('left', `${rect.left + window.scrollX}px`, 'important');
    tooltip.style.setProperty('top', `${rect.top + window.scrollY - 28}px`, 'important');

    document.body.appendChild(tooltip);
    this.currentCSSTooltip = tooltip;
  }

  /**
   * Hide the current CSS tooltip
   */
  hideCSSTooltip() {
    if (this.currentCSSTooltip) {
      this.currentCSSTooltip.remove();
      this.currentCSSTooltip = null;
    }
  }

  /**
   * Trigger sheen effect on the current match
   * @param {Object} match - The current match object
   */
  triggerSheen(match) {
    if (!match) return;

    let rect = null;

    if ((match.type === 'css' || match.type === 'xpath') && match.element) {
      rect = match.element.getBoundingClientRect();
    } else if (match.range) {
      rect = match.range.getBoundingClientRect();
    }

    if (!rect || rect.width === 0 || rect.height === 0) return;

    // Create container for the sheen
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute !important;
      top: ${rect.top + window.scrollY}px !important;
      left: ${rect.left + window.scrollX}px !important;
      width: ${rect.width}px !important;
      height: ${rect.height}px !important;
      pointer-events: none !important;
      z-index: 9999999 !important;
      overflow: hidden !important;
      border-radius: 2px !important;
    `;

    // Create the sheen element that will animate
    const sheen = document.createElement('div');
    sheen.style.cssText = `
      position: absolute !important;
      top: -50% !important;
      left: 0 !important;
      width: 60% !important;
      height: 200% !important;
      background: linear-gradient(
        90deg,
        transparent 0%,
        transparent 20%,
        rgba(255, 255, 255, 0.5) 40%,
        rgba(255, 255, 255, 0.5) 60%,
        transparent 80%,
        transparent 100%
      ) !important;
      transform: translateX(-100%) skewX(-15deg) !important;
      pointer-events: none !important;
    `;

    container.appendChild(sheen);
    document.body.appendChild(container);

    // Animate the sheen across
    requestAnimationFrame(() => {
      sheen.style.transition = 'transform 0.4s ease-out';
      sheen.style.transform = 'translateX(250%) skewX(-15deg)';
    });

    // Remove after animation completes
    setTimeout(() => {
      container.remove();
    }, 450);
  }

  /**
   * Clear all highlights
   */
  clear() {
    // Clear text highlights
    if (CSS.highlights) {
      CSS.highlights.delete(this.highlightName);
      CSS.highlights.delete(this.currentHighlightName);
    }
    this.highlight = null;
    this.currentHighlight = null;

    // Clear CSS element highlights (also used for editable fields)
    this.cssOverlays.forEach(el => {
      el.classList.remove('locate-css-highlight', 'locate-css-highlight-current', 'locate-editable-has-match', 'locate-editable-current-match');
    });
    this.cssOverlays = [];

    // Clear editable field highlights
    this.editableHighlights.forEach(el => {
      el.classList.remove('locate-editable-has-match', 'locate-editable-current-match');
    });
    this.editableHighlights = [];

    // Hide tooltip
    this.hideCSSTooltip();

    // Clear scrollbar markers
    this.clearScrollbarMarkers();
  }

  /**
   * Update scrollbar markers to show match positions
   * Uses DocumentFragment for better performance with many matches
   * @param {Array} matches - Array of match objects
   * @param {number} currentIndex - Index of the current match
   */
  updateScrollbarMarkers(matches, currentIndex = -1) {
    // Clear existing markers
    this.clearScrollbarMarkers();

    if (!matches || matches.length === 0) return;

    // Limit scrollbar markers for performance (sampling for very large result sets)
    const MAX_MARKERS = 500;
    const shouldSample = matches.length > MAX_MARKERS;
    const sampleRate = shouldSample ? Math.ceil(matches.length / MAX_MARKERS) : 1;

    // Create container if it doesn't exist
    if (!this.scrollbarContainer) {
      this.scrollbarContainer = document.createElement('div');
      this.scrollbarContainer.className = 'locate-scrollbar-markers';
      document.body.appendChild(this.scrollbarContainer);
    }

    // Get document height for calculating positions
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.clientHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    );

    // Use DocumentFragment for batch DOM insertion (much faster)
    const fragment = document.createDocumentFragment();

    // Create markers for each match (with optional sampling)
    matches.forEach((match, index) => {
      // Sample matches if there are too many, but always include current match
      if (shouldSample && index !== currentIndex && index % sampleRate !== 0) {
        return;
      }

      let top = 0;

      if ((match.type === 'css' || match.type === 'xpath') && match.element) {
        const rect = match.element.getBoundingClientRect();
        top = rect.top + window.scrollY;
      } else if (match.range) {
        const rect = match.range.getBoundingClientRect();
        top = rect.top + window.scrollY;
      } else {
        return;
      }

      // Calculate marker position as percentage of document
      const percentage = (top / docHeight) * 100;

      const marker = document.createElement('div');
      marker.className = 'locate-scrollbar-marker' + (index === currentIndex ? ' current' : '');
      marker.style.top = `${percentage}%`;

      fragment.appendChild(marker);
      this.scrollbarMarkers.push(marker);
    });

    // Single DOM operation for all markers
    this.scrollbarContainer.appendChild(fragment);
  }

  /**
   * Clear all scrollbar markers
   */
  clearScrollbarMarkers() {
    if (this.scrollbarContainer) {
      this.scrollbarContainer.remove();
      this.scrollbarContainer = null;
    }
    this.scrollbarMarkers = [];
  }

  /**
   * Set custom highlight colors
   * @param {string} matchColor - Background color for matches
   * @param {string} currentColor - Background color for current match
   */
  setColors(matchColor, currentColor) {
    const existingStyle = document.getElementById('locate-highlight-styles');
    if (existingStyle) {
      existingStyle.textContent = `
        ::highlight(${this.highlightName}) {
          background-color: ${matchColor};
          color: inherit;
        }

        ::highlight(${this.currentHighlightName}) {
          background-color: ${currentColor};
          color: inherit;
        }

        .locate-css-highlight {
          outline: 2px solid rgba(138, 180, 248, 0.8) !important;
          outline-offset: 2px !important;
          background-color: rgba(138, 180, 248, 0.1) !important;
          transition: outline-color 0.15s ease, background-color 0.15s ease !important;
        }

        .locate-css-highlight-current {
          outline: 3px solid ${currentColor} !important;
          outline-offset: 2px !important;
          background-color: ${currentColor.replace('0.8', '0.15')} !important;
        }

        .locate-css-tooltip {
          position: absolute;
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          font-size: 11px;
          font-family: monospace;
          border-radius: 4px;
          white-space: nowrap;
          z-index: 2147483646;
          pointer-events: none;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `;
    }
  }

  /**
   * Check if CSS Custom Highlight API is supported
   * @returns {boolean} Whether the API is supported
   */
  isSupported() {
    return !!CSS.highlights;
  }
}

// Export for use in other modules
window.LocateHighlighter = Highlighter;
