/**
 * Replacer - Search and Replace functionality
 * Handles text replacement in editable content and DOM text nodes
 */

class Replacer {
  constructor() {
    this.undoStack = [];
    this.maxUndoSize = 50;
  }

  /**
   * Check if a match is in editable content
   * @param {Object} match - Match object from SearchEngine
   * @returns {Object} { isEditable: boolean, type: string|null, element: Element|null }
   */
  getEditableContext(match) {
    if (!match || !match.node) {
      return { isEditable: false, type: null, element: null };
    }

    const node = match.node;
    let element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;

    // Walk up the tree to find editable context
    while (element) {
      // Check for input elements
      if (element.tagName === 'INPUT' && element.type === 'text') {
        return { isEditable: true, type: 'input', element };
      }

      // Check for textarea
      if (element.tagName === 'TEXTAREA') {
        return { isEditable: true, type: 'textarea', element };
      }

      // Check for contenteditable
      if (element.isContentEditable || element.contentEditable === 'true') {
        return { isEditable: true, type: 'contenteditable', element };
      }

      element = element.parentElement;
    }

    return { isEditable: false, type: null, element: null };
  }

  /**
   * Check if a match can be replaced based on scope
   * @param {Object} match - Match object
   * @param {string} scope - Replace scope: 'input', 'page', or 'html'
   * @returns {Object} { canReplace: boolean, reason: string }
   */
  canReplace(match, scope = 'input') {
    if (!match) {
      return { canReplace: false, reason: 'No match selected' };
    }

    if (match.type === 'css') {
      return { canReplace: false, reason: 'Cannot replace CSS selector matches' };
    }

    // Direct editable field matches from searchEditableFields
    if (match.type === 'input' || match.type === 'textarea' || match.type === 'contenteditable') {
      return { canReplace: true, reason: `Editable ${match.type}` };
    }

    const context = this.getEditableContext(match);

    // 'input' scope: only editable elements
    if (scope === 'input') {
      if (context.isEditable) {
        return { canReplace: true, reason: `Editable ${context.type}` };
      }
      return { canReplace: false, reason: 'Not in editable field (try "page" or "html" scope)' };
    }

    // 'page' scope: editable elements + visible text nodes
    if (scope === 'page') {
      if (context.isEditable) {
        return { canReplace: true, reason: `Editable ${context.type}` };
      }
      // Check if the node is visible
      if (this.isNodeVisible(match.node)) {
        return { canReplace: true, reason: 'Visible page text' };
      }
      return { canReplace: false, reason: 'Text not visible (try "html" scope)' };
    }

    // 'html' scope: all text nodes
    if (context.isEditable) {
      return { canReplace: true, reason: `Editable ${context.type}` };
    }
    return { canReplace: true, reason: 'DOM text node' };
  }

  /**
   * Check if a text node is visible on the page
   * @param {Node} node - Text node to check
   * @returns {boolean}
   */
  isNodeVisible(node) {
    if (!node || !node.parentElement) return false;
    const el = node.parentElement;
    const style = window.getComputedStyle(el);

    // Check basic visibility
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    // Check if element has dimensions
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }

    return true;
  }

  /**
   * Replace a single match
   * @param {Object} match - Match object from SearchEngine
   * @param {string} replacement - Replacement text
   * @param {string} scope - Replace scope: 'input', 'page', or 'html'
   * @returns {Object} { success: boolean, error: string|null }
   */
  replaceMatch(match, replacement, scope = 'input') {
    const canReplaceResult = this.canReplace(match, scope);
    if (!canReplaceResult.canReplace) {
      return { success: false, error: canReplaceResult.reason };
    }

    try {
      // Handle direct editable field matches from searchEditableFields
      if (match.type === 'input' || match.type === 'textarea') {
        return this.replaceInInputDirect(match, replacement);
      }
      if (match.type === 'contenteditable') {
        return this.replaceInContentEditableDirect(match, replacement);
      }

      const context = this.getEditableContext(match);

      if (context.isEditable) {
        return this.replaceInEditable(match, replacement, context);
      } else {
        return this.replaceInDOM(match, replacement);
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Replace text directly in an input/textarea element (from searchEditableFields match)
   * @param {Object} match - Match object with element, startOffset, endOffset
   * @param {string} replacement - Replacement text
   * @returns {Object} { success: boolean, error: string|null }
   */
  replaceInInputDirect(match, replacement) {
    const element = match.element;

    // Store for undo
    const undoData = {
      type: 'editable',
      element,
      editableType: 'input',
      originalValue: element.value,
      matchText: match.text,
      replacement,
      timestamp: Date.now()
    };

    // Replace directly in the value without focusing the element
    const value = element.value;
    const newValue = value.substring(0, match.startOffset) + replacement + value.substring(match.endOffset);
    element.value = newValue;

    // Dispatch input event for framework compatibility
    this.dispatchInputEvents(element);

    // Add to undo stack
    this.pushUndo(undoData);

    return { success: true, error: null };
  }

  /**
   * Replace text directly in a contenteditable element (from searchEditableFields match)
   * @param {Object} match - Match object with element, startOffset, endOffset
   * @param {string} replacement - Replacement text
   * @returns {Object} { success: boolean, error: string|null }
   */
  replaceInContentEditableDirect(match, replacement) {
    const element = match.element;

    // Store for undo
    const undoData = {
      type: 'editable',
      element,
      editableType: 'contenteditable',
      originalValue: element.innerHTML,
      matchText: match.text,
      replacement,
      timestamp: Date.now()
    };

    // Focus the contenteditable element
    element.focus();

    // Create a range for the match
    const textNode = this.findTextNodeAtOffset(element, match.startOffset);
    if (!textNode) {
      return { success: false, error: 'Could not locate text node in contenteditable' };
    }

    // Calculate local offset within the found text node
    const range = document.createRange();
    const localStart = match.startOffset - textNode.cumulativeOffset;
    const localEnd = localStart + (match.endOffset - match.startOffset);

    range.setStart(textNode.node, localStart);
    range.setEnd(textNode.node, Math.min(localEnd, textNode.node.textContent.length));

    // Select the range
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // Use execCommand for contenteditable (preserves undo history)
    const success = document.execCommand('insertText', false, replacement);

    if (!success) {
      // Fallback: direct DOM manipulation
      range.deleteContents();
      range.insertNode(document.createTextNode(replacement));
    }

    // Dispatch input event
    this.dispatchInputEvents(element);

    // Add to undo stack
    this.pushUndo(undoData);

    return { success: true, error: null };
  }

  /**
   * Find text node at a given cumulative offset within an element
   * @param {Element} element - Container element
   * @param {number} offset - Cumulative character offset
   * @returns {Object|null} { node, cumulativeOffset } or null
   */
  findTextNodeAtOffset(element, offset) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let cumulativeOffset = 0;
    let node;

    while ((node = walker.nextNode())) {
      const nodeLength = node.textContent.length;
      if (cumulativeOffset + nodeLength > offset) {
        return { node, cumulativeOffset };
      }
      cumulativeOffset += nodeLength;
    }

    return null;
  }

  /**
   * Replace text in an editable element
   * @param {Object} match - Match object
   * @param {string} replacement - Replacement text
   * @param {Object} context - Editable context
   * @returns {Object} { success: boolean, error: string|null }
   */
  replaceInEditable(match, replacement, context) {
    const { type, element } = context;

    // Store for undo
    const undoData = {
      type: 'editable',
      element,
      editableType: type,
      originalValue: type === 'contenteditable' ? element.innerHTML : element.value,
      matchText: match.text,
      replacement,
      timestamp: Date.now()
    };

    try {
      switch (type) {
        case 'input':
        case 'textarea':
          return this.replaceInInputOrTextarea(element, match, replacement, undoData);
        case 'contenteditable':
          return this.replaceInContentEditable(element, match, replacement, undoData);
        default:
          return { success: false, error: `Unknown editable type: ${type}` };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Replace text in input or textarea using setRangeText
   * @param {HTMLInputElement|HTMLTextAreaElement} element - Input element
   * @param {Object} match - Match object
   * @param {string} replacement - Replacement text
   * @param {Object} undoData - Undo data
   * @returns {Object} { success: boolean, error: string|null }
   */
  replaceInInputOrTextarea(element, match, replacement, undoData) {
    const value = element.value;
    const matchText = match.text;

    // Find the match position in the element's value
    const searchStart = 0;
    let matchIndex = -1;

    // For input/textarea, we need to find the match in the value
    // The match might not have direct offset info for the input
    if (match.startOffset !== undefined && match.node === element.firstChild) {
      matchIndex = match.startOffset;
    } else {
      // Search for the text in the value
      const caseSensitive = match.caseSensitive !== false;
      const searchValue = caseSensitive ? value : value.toLowerCase();
      const searchText = caseSensitive ? matchText : matchText.toLowerCase();
      matchIndex = searchValue.indexOf(searchText);
    }

    if (matchIndex === -1) {
      return { success: false, error: 'Could not locate match in input' };
    }

    // Focus the element
    element.focus();

    // Use setRangeText for proper replacement
    element.setSelectionRange(matchIndex, matchIndex + matchText.length);

    // Use setRangeText if available, otherwise use execCommand
    if (typeof element.setRangeText === 'function') {
      element.setRangeText(replacement, matchIndex, matchIndex + matchText.length, 'end');
    } else {
      // Fallback for older browsers
      document.execCommand('insertText', false, replacement);
    }

    // Dispatch input event for framework compatibility
    this.dispatchInputEvents(element);

    // Add to undo stack
    this.pushUndo(undoData);

    return { success: true, error: null };
  }

  /**
   * Replace text in contenteditable element
   * @param {Element} element - Contenteditable element
   * @param {Object} match - Match object
   * @param {string} replacement - Replacement text
   * @param {Object} undoData - Undo data
   * @returns {Object} { success: boolean, error: string|null }
   */
  replaceInContentEditable(element, match, replacement, undoData) {
    if (!match.range) {
      return { success: false, error: 'No range available for replacement' };
    }

    // Focus the contenteditable element
    element.focus();

    // Select the range
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(match.range.cloneRange());

    // Use execCommand for contenteditable (preserves undo history)
    const success = document.execCommand('insertText', false, replacement);

    if (!success) {
      // Fallback: direct DOM manipulation
      match.range.deleteContents();
      match.range.insertNode(document.createTextNode(replacement));
    }

    // Dispatch input event
    this.dispatchInputEvents(element);

    // Add to undo stack
    this.pushUndo(undoData);

    return { success: true, error: null };
  }

  /**
   * Replace text directly in DOM text nodes
   * @param {Object} match - Match object
   * @param {string} replacement - Replacement text
   * @returns {Object} { success: boolean, error: string|null }
   */
  replaceInDOM(match, replacement) {
    if (!match.node || match.node.nodeType !== Node.TEXT_NODE) {
      return { success: false, error: 'Invalid text node' };
    }

    const textNode = match.node;
    const originalText = textNode.textContent;

    // Store for undo
    const undoData = {
      type: 'dom',
      node: textNode,
      originalText,
      matchText: match.text,
      startOffset: match.startOffset,
      endOffset: match.endOffset,
      replacement,
      timestamp: Date.now()
    };

    // Perform replacement
    const before = originalText.substring(0, match.startOffset);
    const after = originalText.substring(match.endOffset);
    textNode.textContent = before + replacement + after;

    // Add to undo stack
    this.pushUndo(undoData);

    return { success: true, error: null };
  }

  /**
   * Replace all matches
   * @param {Array} matches - Array of match objects
   * @param {string} replacement - Replacement text
   * @param {string} scope - Replace scope: 'input', 'page', or 'html'
   * @param {string} searchMode - The search mode ('text', 'regex', 'css')
   * @param {string} originalQuery - The original search query (for regex replacements)
   * @returns {Object} { successCount: number, failCount: number, errors: Array }
   */
  replaceAll(matches, replacement, scope = 'input', searchMode = 'text', originalQuery = '') {
    const results = {
      successCount: 0,
      failCount: 0,
      errors: []
    };

    if (!matches || matches.length === 0) {
      return results;
    }

    // Process matches in reverse order to maintain correct positions
    const sortedMatches = [...matches].sort((a, b) => {
      // Sort by document position (reverse order)
      if (a.node === b.node) {
        return (b.startOffset || 0) - (a.startOffset || 0);
      }
      // Compare document position
      const position = a.node.compareDocumentPosition(b.node);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return 1;
      }
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return -1;
      }
      return 0;
    });

    for (const match of sortedMatches) {
      // Calculate replacement text (handle regex capture groups)
      let actualReplacement = replacement;
      if (searchMode === 'regex' && match.groups && match.groups.length > 0) {
        actualReplacement = this.processRegexReplacement(replacement, match);
      }

      const result = this.replaceMatch(match, actualReplacement, scope);

      if (result.success) {
        results.successCount++;
      } else {
        results.failCount++;
        if (result.error && !results.errors.includes(result.error)) {
          results.errors.push(result.error);
        }
      }
    }

    return results;
  }

  /**
   * Process regex replacement with capture groups
   * @param {string} replacement - Replacement pattern
   * @param {Object} match - Match object with groups
   * @returns {string} Processed replacement string
   */
  processRegexReplacement(replacement, match) {
    let result = replacement;

    // Replace $& with the full match
    result = result.replace(/\$&/g, match.text);

    // Replace $1, $2, etc. with capture groups
    if (match.groups) {
      match.groups.forEach((group, index) => {
        const pattern = new RegExp(`\\$${index + 1}`, 'g');
        result = result.replace(pattern, group || '');
      });
    }

    // Handle $$ for literal $
    result = result.replace(/\$\$/g, '$');

    return result;
  }

  /**
   * Dispatch input events for framework compatibility
   * @param {Element} element - The element that was modified
   */
  dispatchInputEvents(element) {
    // Input event
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText'
    });
    element.dispatchEvent(inputEvent);

    // Change event
    const changeEvent = new Event('change', {
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(changeEvent);
  }

  /**
   * Push an operation to the undo stack
   * @param {Object} undoData - Undo data
   */
  pushUndo(undoData) {
    this.undoStack.push(undoData);

    // Limit stack size
    if (this.undoStack.length > this.maxUndoSize) {
      this.undoStack.shift();
    }
  }

  /**
   * Undo the last replacement
   * @returns {Object} { success: boolean, error: string|null }
   */
  undo() {
    if (this.undoStack.length === 0) {
      return { success: false, error: 'Nothing to undo' };
    }

    const undoData = this.undoStack.pop();

    try {
      switch (undoData.type) {
        case 'editable':
          return this.undoEditable(undoData);
        case 'dom':
          return this.undoDOM(undoData);
        default:
          return { success: false, error: 'Unknown undo type' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Undo an editable replacement
   * @param {Object} undoData - Undo data
   * @returns {Object} { success: boolean, error: string|null }
   */
  undoEditable(undoData) {
    const { element, editableType, originalValue } = undoData;

    if (!element || !document.body.contains(element)) {
      return { success: false, error: 'Element no longer exists' };
    }

    if (editableType === 'contenteditable') {
      element.innerHTML = originalValue;
    } else {
      element.value = originalValue;
    }

    this.dispatchInputEvents(element);
    return { success: true, error: null };
  }

  /**
   * Undo a DOM replacement
   * @param {Object} undoData - Undo data
   * @returns {Object} { success: boolean, error: string|null }
   */
  undoDOM(undoData) {
    const { node, originalText } = undoData;

    if (!node || !document.body.contains(node)) {
      return { success: false, error: 'Text node no longer exists' };
    }

    node.textContent = originalText;
    return { success: true, error: null };
  }

  /**
   * Clear the undo stack
   */
  clearUndo() {
    this.undoStack = [];
  }

  /**
   * Check if undo is available
   * @returns {boolean}
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Get the number of operations in the undo stack
   * @returns {number}
   */
  getUndoCount() {
    return this.undoStack.length;
  }
}

// Export for use in other modules
window.LocateReplacer = Replacer;
