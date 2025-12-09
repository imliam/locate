/**
 * Locate - Storage Layer
 * Wrapper for chrome.storage.sync with default settings and type safety
 */

/**
 * Default settings configuration
 */
const DEFAULT_SETTINGS = {
  // Appearance
  theme: 'system', // 'light', 'dark', 'system'
  highlightColor: '#ffeb3b',
  highlightCurrentColor: '#ff9800',
  highlightOpacity: 0.4,

  // Search behavior
  caseSensitive: false,
  wholeWord: false,
  autoSearch: true, // Search as you type
  searchDelay: 150, // ms delay for auto-search

  // Keybinds
  keybinds: {
    toggle: { key: 'f', ctrlKey: false, shiftKey: false, altKey: false, metaKey: true },
    toggleReplace: { key: 'f', ctrlKey: false, shiftKey: true, altKey: false, metaKey: true },
    nextMatch: { key: 'Enter', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false },
    prevMatch: { key: 'Enter', ctrlKey: false, shiftKey: true, altKey: false, metaKey: false },
    close: { key: 'Escape', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false },
    toggleCase: { key: 'c', ctrlKey: false, shiftKey: false, altKey: true, metaKey: false },
    toggleWholeWord: { key: 'w', ctrlKey: false, shiftKey: false, altKey: true, metaKey: false },
    replaceCurrent: { key: 'Enter', ctrlKey: false, shiftKey: false, altKey: false, metaKey: true },
    replaceAll: { key: 'Enter', ctrlKey: false, shiftKey: true, altKey: false, metaKey: true }
  }
};

/**
 * Keybind display names
 */
const KEYBIND_LABELS = {
  toggle: 'Open Find',
  toggleReplace: 'Open Find & Replace',
  nextMatch: 'Next Match',
  prevMatch: 'Previous Match',
  close: 'Close',
  toggleCase: 'Toggle Case Sensitive',
  toggleWholeWord: 'Toggle Whole Word',
  replaceCurrent: 'Replace Current',
  replaceAll: 'Replace All'
};

/**
 * Storage class for managing extension settings
 */
class LocateStorage {
  constructor() {
    this.cache = null;
    this.listeners = new Set();
    this.setupStorageListener();
  }

  /**
   * Set up listener for storage changes
   */
  setupStorageListener() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync' && changes.settings) {
          this.cache = changes.settings.newValue;
          this.notifyListeners(changes.settings.newValue, changes.settings.oldValue);
        }
      });
    }
  }

  /**
   * Add a settings change listener
   * @param {Function} callback - Called when settings change
   * @returns {Function} Unsubscribe function
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of settings change
   * @param {Object} newSettings - New settings
   * @param {Object} oldSettings - Old settings
   */
  notifyListeners(newSettings, oldSettings) {
    for (const listener of this.listeners) {
      try {
        listener(newSettings, oldSettings);
      } catch (e) {
        console.error('Locate: Settings listener error', e);
      }
    }
  }

  /**
   * Get all settings with defaults
   * @returns {Promise<Object>} Settings object
   */
  async getSettings() {
    if (this.cache) {
      return this.cache;
    }

    if (typeof chrome === 'undefined' || !chrome.storage) {
      return { ...DEFAULT_SETTINGS };
    }

    try {
      const result = await chrome.storage.sync.get('settings');
      this.cache = this.mergeWithDefaults(result.settings || {});
      return this.cache;
    } catch (e) {
      console.error('Locate: Failed to load settings', e);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Get a single setting value
   * @param {string} key - Setting key (supports dot notation)
   * @returns {Promise<any>} Setting value
   */
  async get(key) {
    const settings = await this.getSettings();
    return this.getNestedValue(settings, key);
  }

  /**
   * Set a single setting value
   * @param {string} key - Setting key (supports dot notation)
   * @param {any} value - Setting value
   */
  async set(key, value) {
    const settings = await this.getSettings();
    this.setNestedValue(settings, key, value);
    await this.saveSettings(settings);
  }

  /**
   * Update multiple settings at once
   * @param {Object} updates - Partial settings object
   */
  async update(updates) {
    const settings = await this.getSettings();
    const merged = this.deepMerge(settings, updates);
    await this.saveSettings(merged);
  }

  /**
   * Save settings to storage
   * @param {Object} settings - Settings to save
   */
  async saveSettings(settings) {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      this.cache = settings;
      return;
    }

    try {
      await chrome.storage.sync.set({ settings });
      this.cache = settings;
    } catch (e) {
      console.error('Locate: Failed to save settings', e);
      throw e;
    }
  }

  /**
   * Reset settings to defaults
   */
  async resetToDefaults() {
    await this.saveSettings({ ...DEFAULT_SETTINGS });
  }

  /**
   * Reset a single keybind to default
   * @param {string} action - Keybind action name
   */
  async resetKeybind(action) {
    if (DEFAULT_SETTINGS.keybinds[action]) {
      await this.set(`keybinds.${action}`, { ...DEFAULT_SETTINGS.keybinds[action] });
    }
  }

  /**
   * Reset all keybinds to defaults
   */
  async resetAllKeybinds() {
    await this.set('keybinds', { ...DEFAULT_SETTINGS.keybinds });
  }

  /**
   * Export settings as JSON string
   * @returns {Promise<string>} JSON settings
   */
  async exportSettings() {
    const settings = await this.getSettings();
    return JSON.stringify(settings, null, 2);
  }

  /**
   * Import settings from JSON string
   * @param {string} json - JSON settings string
   * @returns {Promise<boolean>} Success status
   */
  async importSettings(json) {
    try {
      const imported = JSON.parse(json);
      const validated = this.mergeWithDefaults(imported);
      await this.saveSettings(validated);
      return true;
    } catch (e) {
      console.error('Locate: Failed to import settings', e);
      return false;
    }
  }

  /**
   * Merge settings with defaults (ensuring all keys exist)
   * @param {Object} settings - Partial settings
   * @returns {Object} Complete settings
   */
  mergeWithDefaults(settings) {
    return this.deepMerge({ ...DEFAULT_SETTINGS }, settings);
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Object to search
   * @param {string} path - Dot-separated path
   * @returns {any} Value at path
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested value in object using dot notation
   * @param {Object} obj - Object to modify
   * @param {string} path - Dot-separated path
   * @param {any} value - Value to set
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  /**
   * Check for keybind conflicts
   * @param {string} action - Action being set
   * @param {Object} keybind - Keybind configuration
   * @returns {Promise<string|null>} Conflicting action name or null
   */
  async checkKeybindConflict(action, keybind) {
    const settings = await this.getSettings();

    for (const [existingAction, existingKeybind] of Object.entries(settings.keybinds)) {
      if (existingAction === action) continue;

      if (this.keybindsMatch(keybind, existingKeybind)) {
        return existingAction;
      }
    }

    return null;
  }

  /**
   * Check if two keybinds match
   * @param {Object} a - First keybind
   * @param {Object} b - Second keybind
   * @returns {boolean} Whether they match
   */
  keybindsMatch(a, b) {
    return (
      a.key?.toLowerCase() === b.key?.toLowerCase() &&
      !!a.ctrlKey === !!b.ctrlKey &&
      !!a.shiftKey === !!b.shiftKey &&
      !!a.altKey === !!b.altKey &&
      !!a.metaKey === !!b.metaKey
    );
  }

  /**
   * Format keybind for display
   * @param {Object} keybind - Keybind configuration
   * @returns {string} Human-readable keybind string
   */
  formatKeybind(keybind) {
    if (!keybind || !keybind.key) return 'Not set';

    const parts = [];
    const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac');

    if (keybind.ctrlKey) parts.push(isMac ? '⌃' : 'Ctrl');
    if (keybind.altKey) parts.push(isMac ? '⌥' : 'Alt');
    if (keybind.shiftKey) parts.push(isMac ? '⇧' : 'Shift');
    if (keybind.metaKey) parts.push(isMac ? '⌘' : 'Win');

    // Format special keys
    let keyDisplay = keybind.key;
    const specialKeys = {
      'Enter': '↵',
      'Escape': 'Esc',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
      'Backspace': '⌫',
      'Delete': 'Del',
      'Tab': '⇥',
      ' ': 'Space'
    };

    if (specialKeys[keyDisplay]) {
      keyDisplay = specialKeys[keyDisplay];
    } else if (keyDisplay.length === 1) {
      keyDisplay = keyDisplay.toUpperCase();
    }

    parts.push(keyDisplay);

    return isMac ? parts.join('') : parts.join('+');
  }

  /**
   * Parse keyboard event to keybind object
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {Object} Keybind configuration
   */
  eventToKeybind(event) {
    return {
      key: event.key,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey
    };
  }

  /**
   * Check if keyboard event matches a keybind
   * @param {KeyboardEvent} event - Keyboard event
   * @param {Object} keybind - Keybind configuration
   * @returns {boolean} Whether they match
   */
  eventMatchesKeybind(event, keybind) {
    if (!keybind || !keybind.key) return false;

    return (
      event.key.toLowerCase() === keybind.key.toLowerCase() &&
      event.ctrlKey === !!keybind.ctrlKey &&
      event.shiftKey === !!keybind.shiftKey &&
      event.altKey === !!keybind.altKey &&
      event.metaKey === !!keybind.metaKey
    );
  }

  /**
   * Get default settings
   * @returns {Object} Default settings
   */
  getDefaults() {
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Get keybind labels
   * @returns {Object} Keybind label mapping
   */
  getKeybindLabels() {
    return { ...KEYBIND_LABELS };
  }

  /**
   * Get search/replace history from local storage
   * @returns {Promise<Object>} History object with searchHistory and replaceHistory arrays
   */
  async getHistory() {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return { searchHistory: [], replaceHistory: [] };
    }

    try {
      const result = await chrome.storage.local.get('history');
      return result.history || { searchHistory: [], replaceHistory: [] };
    } catch (e) {
      console.error('Locate: Failed to load history', e);
      return { searchHistory: [], replaceHistory: [] };
    }
  }

  /**
   * Save search/replace history to local storage
   * @param {Object} history - Object with searchHistory and replaceHistory arrays
   */
  async saveHistory(history) {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      await chrome.storage.local.set({ history });
    } catch (e) {
      console.error('Locate: Failed to save history', e);
    }
  }
}

// Export for different environments
if (typeof window !== 'undefined') {
  window.LocateStorage = LocateStorage;
  window.LOCATE_DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  window.LOCATE_KEYBIND_LABELS = KEYBIND_LABELS;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LocateStorage, DEFAULT_SETTINGS, KEYBIND_LABELS };
}
