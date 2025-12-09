/**
 * VarDumper Integration Module
 * Provides integration with Symfony VarDumper's collapsible HTML output
 */

class VarDumperIntegration {
  constructor() {
    this.dumpElements = [];
    this.initialised = false;
    this.originalStates = new Map(); // Store original expand/collapse states
    this.sectionCount = 0; // Cache section count for performance checks
    this.maxSectionsForFullSearch = 500; // Skip full expand/collapse if too many sections
  }

  /**
   * Check if the page contains VarDumper output
   * @returns {boolean}
   */
  hasVarDumper() {
    // Re-check each time in case new dumps were added dynamically
    const dumps = document.querySelectorAll('pre.sf-dump');
    if (dumps.length > 0 && !this.initialised) {
      this.initialise();
    }
    return dumps.length > 0;
  }

  /**
   * Initialise the integration by finding all VarDumper elements
   */
  initialise() {
    this.dumpElements = Array.from(document.querySelectorAll('pre.sf-dump'));
    this.initialised = this.dumpElements.length > 0;

    // Cache section count for performance decisions
    this.sectionCount = 0;
    this.dumpElements.forEach(dump => {
      this.sectionCount += dump.querySelectorAll('samp').length;
    });
  }

  /**
   * Check if the VarDumper content is small enough for full expand/search
   * @returns {boolean}
   */
  canDoFullSearch() {
    return this.sectionCount <= this.maxSectionsForFullSearch;
  }

  /**
   * Expand ALL sections in all dumps (for searching hidden content)
   * Stores original states for later restoration
   */
  expandAllForSearch() {
    if (!this.initialised) {
      this.initialise();
    }

    // Skip if too many sections (would cause lag)
    if (!this.canDoFullSearch()) {
      return;
    }

    this.originalStates.clear();

    this.dumpElements.forEach(dump => {
      const samps = dump.querySelectorAll('samp.sf-dump-compact, samp.sf-dump-expanded');
      samps.forEach((samp, index) => {
        // Store the original state
        const key = `${dump.id || 'dump'}-${index}`;
        this.originalStates.set(key, samp.classList.contains('sf-dump-expanded'));

        // Expand the section - use fast method without events for performance
        this.expandSectionFast(samp);
      });
    });
  }

  /**
   * Restore all sections to their original collapsed state,
   * then expand only sections containing matches
   */
  collapseAllAfterSearch() {
    // Skip if too many sections
    if (!this.canDoFullSearch()) {
      return;
    }

    this.dumpElements.forEach(dump => {
      // Collapse all sections using fast method
      const expandedSamps = dump.querySelectorAll('samp.sf-dump-expanded');
      expandedSamps.forEach(samp => {
        this.collapseSectionFast(samp);
      });

      // Expand the first level only
      const firstToggle = dump.querySelector('a.sf-dump-toggle');
      if (firstToggle) {
        const firstSamp = firstToggle.nextElementSibling;
        if (firstSamp && firstSamp.tagName === 'SAMP') {
          this.expandSectionFast(firstSamp);
          // Update arrow for first toggle only
          const arrow = firstToggle.querySelector('span');
          if (arrow) arrow.innerHTML = '▼';
        }
      }
    });
  }

  /**
   * Fast expand without event dispatch (for bulk operations)
   * @param {Element} samp - The SAMP element
   */
  expandSectionFast(samp) {
    if (!samp || samp.classList.contains('sf-dump-expanded')) return;
    samp.classList.remove('sf-dump-compact');
    samp.classList.add('sf-dump-expanded');
  }

  /**
   * Fast collapse without event dispatch (for bulk operations)
   * @param {Element} samp - The SAMP element
   */
  collapseSectionFast(samp) {
    if (!samp || samp.classList.contains('sf-dump-compact')) return;
    samp.classList.remove('sf-dump-expanded');
    samp.classList.add('sf-dump-compact');
  }

  /**
   * Expand all parent sections to reveal a node within a VarDumper dump
   * This mimics VarDumper's built-in reveal() function
   * @param {Node} node - The node to reveal
   * @returns {boolean} - Whether any sections were expanded
   */
  revealNode(node) {
    if (!node) return false;

    const parents = [];
    let current = node;

    // Walk up the DOM tree to find all collapsed parent sections
    while ((current = current.parentNode)) {
      if (current.nodeType !== Node.ELEMENT_NODE) continue;

      // Check if this is a SAMP element (collapsible container)
      if (current.tagName === 'SAMP') {
        const toggleLink = current.previousElementSibling;
        if (toggleLink && toggleLink.tagName === 'A' && toggleLink.classList.contains('sf-dump-toggle')) {
          parents.push({ samp: current, toggle: toggleLink });
        }
      }

      // Stop at the sf-dump container
      if (current.classList && current.classList.contains('sf-dump')) {
        break;
      }
    }

    if (parents.length === 0) return false;

    // Expand all parent sections (from outermost to innermost)
    parents.reverse().forEach(({ samp, toggle }) => {
      this.expandSection(samp, toggle);
    });

    return true;
  }

  /**
   * Expand a single section
   * @param {Element} samp - The SAMP element containing the content
   * @param {Element} toggle - The toggle link element
   */
  expandSection(samp, toggle) {
    if (!samp || !toggle) return;

    // Check if already expanded
    if (samp.classList.contains('sf-dump-expanded')) return;

    // Fire the sfbeforedumpexpand event (for compatibility with VarDumper's event system)
    if (document.createEvent && samp.dispatchEvent) {
      const event = document.createEvent('Event');
      event.initEvent('sfbeforedumpexpand', true, false);
      samp.dispatchEvent(event);
    }

    // Update classes
    samp.classList.remove('sf-dump-compact');
    samp.classList.add('sf-dump-expanded');

    // Update the toggle arrow
    const arrow = toggle.querySelector('span');
    if (arrow) {
      arrow.innerHTML = '▼';
    }
  }

  /**
   * Collapse a single section
   * @param {Element} samp - The SAMP element containing the content
   * @param {Element} toggle - The toggle link element
   */
  collapseSection(samp, toggle) {
    if (!samp || !toggle) return;

    // Check if already collapsed
    if (samp.classList.contains('sf-dump-compact')) return;

    // Fire the sfbeforedumpcollapse event
    if (document.createEvent && samp.dispatchEvent) {
      const event = document.createEvent('Event');
      event.initEvent('sfbeforedumpcollapse', true, false);
      samp.dispatchEvent(event);
    }

    // Update classes
    samp.classList.remove('sf-dump-expanded');
    samp.classList.add('sf-dump-compact');

    // Update the toggle arrow
    const arrow = toggle.querySelector('span');
    if (arrow) {
      arrow.innerHTML = '▶';
    }
  }

  /**
   * Collapse all sections in a dump element, then expand just the first level
   * This mimics VarDumper's collapseAll() function
   * @param {Element} dumpElement - The sf-dump element
   */
  collapseAll(dumpElement) {
    if (!dumpElement) return;

    const firstToggle = dumpElement.querySelector('a.sf-dump-toggle');
    if (!firstToggle) return;

    const firstSamp = firstToggle.nextElementSibling;
    if (!firstSamp || firstSamp.tagName !== 'SAMP') return;

    // Collapse everything recursively
    const expandedSamps = dumpElement.querySelectorAll('samp.sf-dump-expanded');
    expandedSamps.forEach(samp => {
      const toggle = samp.previousElementSibling;
      if (toggle && toggle.tagName === 'A') {
        this.collapseSection(samp, toggle);
      }
    });

    // Expand just the first level
    this.expandSection(firstSamp, firstToggle);
  }

  /**
   * Reset all dumps to their default collapsed state
   */
  resetAllDumps() {
    this.dumpElements.forEach(dump => {
      this.collapseAll(dump);
    });
  }

  /**
   * Get the containing sf-dump element for a node
   * @param {Node} node - The node to check
   * @returns {Element|null} - The sf-dump element or null
   */
  getContainingDump(node) {
    let current = node;
    while (current) {
      if (current.nodeType === Node.ELEMENT_NODE &&
          current.classList &&
          current.classList.contains('sf-dump')) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  }

  /**
   * Check if a node is inside a VarDumper element
   * @param {Node} node - The node to check
   * @returns {boolean}
   */
  isInsideDump(node) {
    return this.getContainingDump(node) !== null;
  }

  /**
   * Process matches to expand VarDumper sections as needed
   * Call this after finding matches to ensure they're visible
   * @param {Array} matches - Array of match objects from the search engine
   */
  revealMatches(matches) {
    if (!this.initialised) {
      this.initialise();
    }

    if (!this.hasVarDumper()) return;

    // First, reset all dumps to collapsed state
    this.resetAllDumps();

    // Then expand sections for each match
    matches.forEach(match => {
      let node = null;

      // Get the node from the match
      if (match.range) {
        node = match.range.startContainer;
      } else if (match.element) {
        node = match.element;
      }

      if (node && this.isInsideDump(node)) {
        this.revealNode(node);
      }
    });
  }

  /**
   * Reveal a single match (useful when navigating between matches)
   * @param {Object} match - The match object
   */
  revealMatch(match) {
    if (!match) return;

    let node = null;
    if (match.range) {
      node = match.range.startContainer;
    } else if (match.element) {
      node = match.element;
    }

    if (node && this.isInsideDump(node)) {
      this.revealNode(node);
    }
  }
}

// Export for use in content scripts
window.LocateVarDumperIntegration = VarDumperIntegration;
