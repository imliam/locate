/**
 * Locate - Options Page Script
 * Handles settings UI and storage
 */

(function () {
  'use strict';

  // Storage instance
  let storage = null;

  // AI provider info
  let aiProviders = null;

  // DOM elements
  const elements = {};

  // Current keybind being edited
  let editingKeybind = null;
  let capturedKeybind = null;

  /**
   * Initialise the options page
   */
  async function init() {
    storage = new window.LocateStorage();
    aiProviders = window.LocateAIProviders || {};

    // Cache DOM elements
    cacheElements();

    // Load and display settings
    await loadSettings();

    // Set up event listeners
    attachEventListeners();

    // Set version
    document.getElementById('version').textContent = chrome.runtime.getManifest().version;
  }

  /**
   * Cache DOM element references
   */
  function cacheElements() {
    // General settings
    elements.autoSearch = document.getElementById('autoSearch');
    elements.searchDelay = document.getElementById('searchDelay');

    // Appearance settings
    elements.theme = document.getElementById('theme');
    elements.highlightColor = document.getElementById('highlightColor');
    elements.highlightColorText = document.getElementById('highlightColorText');
    elements.highlightCurrentColor = document.getElementById('highlightCurrentColor');
    elements.highlightCurrentColorText = document.getElementById('highlightCurrentColorText');
    elements.highlightOpacity = document.getElementById('highlightOpacity');
    elements.highlightOpacityValue = document.getElementById('highlightOpacityValue');

    // Search defaults
    elements.caseSensitive = document.getElementById('caseSensitive');
    elements.wholeWord = document.getElementById('wholeWord');

    // Keybinds
    elements.keybindsContainer = document.getElementById('keybinds-container');
    elements.resetKeybinds = document.getElementById('resetKeybinds');

    // Import/Export
    elements.exportSettings = document.getElementById('exportSettings');
    elements.importSettings = document.getElementById('importSettings');
    elements.importFile = document.getElementById('importFile');

    // AI Settings
    elements.aiProvider = document.getElementById('aiProvider');
    elements.aiModel = document.getElementById('aiModel');
    elements.openaiKey = document.getElementById('openaiKey');
    elements.anthropicKey = document.getElementById('anthropicKey');
    elements.googleKey = document.getElementById('googleKey');
    elements.aiTemperature = document.getElementById('aiTemperature');
    elements.aiTemperatureValue = document.getElementById('aiTemperatureValue');
    elements.aiToolApproval = document.getElementById('aiToolApproval');

    // AI Suggestions
    elements.aiSuggestionsContainer = document.getElementById('aiSuggestionsContainer');
    elements.addSuggestion = document.getElementById('addSuggestion');
    elements.resetSuggestions = document.getElementById('resetSuggestions');

    // Reset
    elements.resetAll = document.getElementById('resetAll');

    // Status
    elements.statusBar = document.getElementById('statusBar');
    elements.statusMessage = document.getElementById('statusMessage');

    // Modal
    elements.keybindModal = document.getElementById('keybindModal');
    elements.keybindModalAction = document.getElementById('keybindModalAction');
    elements.keybindModalCapture = document.getElementById('keybindModalCapture');
    elements.keybindModalConflict = document.getElementById('keybindModalConflict');
    elements.keybindModalCancel = document.getElementById('keybindModalCancel');
    elements.keybindModalSave = document.getElementById('keybindModalSave');
  }

  /**
   * Load settings and populate UI
   */
  async function loadSettings() {
    const settings = await storage.getSettings();

    // General
    elements.autoSearch.checked = settings.autoSearch;
    elements.searchDelay.value = settings.searchDelay;

    // Appearance
    elements.theme.value = settings.theme;
    elements.highlightColor.value = settings.highlightColor;
    elements.highlightColorText.value = settings.highlightColor;
    elements.highlightCurrentColor.value = settings.highlightCurrentColor;
    elements.highlightCurrentColorText.value = settings.highlightCurrentColor;
    elements.highlightOpacity.value = settings.highlightOpacity;
    elements.highlightOpacityValue.textContent = settings.highlightOpacity;

    // Search defaults
    elements.caseSensitive.checked = settings.caseSensitive;
    elements.wholeWord.checked = settings.wholeWord;

    // Keybinds
    renderKeybinds(settings.keybinds);

    // AI Settings
    loadAISettings(settings);
  }

  /**
   * Load AI settings into UI
   * @param {Object} settings - Full settings object
   */
  function loadAISettings(settings) {
    const ai = settings.ai || window.LocateDefaultAISettings || {};

    // Provider
    elements.aiProvider.value = ai.provider || 'openai';

    // Populate models for selected provider
    updateModelDropdown(ai.provider || 'openai', ai.models);

    // API Keys (masked)
    elements.openaiKey.value = ai.apiKeys?.openai || '';
    elements.anthropicKey.value = ai.apiKeys?.anthropic || '';
    elements.googleKey.value = ai.apiKeys?.google || '';

    // Temperature
    elements.aiTemperature.value = ai.temperature ?? 0.7;
    elements.aiTemperatureValue.textContent = ai.temperature ?? 0.7;

    // Tool approval mode
    elements.aiToolApproval.value = ai.toolApproval || 'manual';

    // AI Suggestions
    const defaultSuggestions = window.LocateDefaultAISettings?.suggestions || [];
    const suggestions = ai.suggestions || defaultSuggestions;
    renderAISuggestions(suggestions);
  }

  /**
   * Update model dropdown based on selected provider
   * @param {string} provider - Provider name
   * @param {Object} savedModels - Saved model selections
   */
  function updateModelDropdown(provider, savedModels = {}) {
    const providerInfo = aiProviders[provider];
    if (!providerInfo) return;

    elements.aiModel.innerHTML = '';

    for (const model of providerInfo.models) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.name} - ${model.description}`;
      elements.aiModel.appendChild(option);
    }

    // Set saved model or default
    const savedModel = savedModels?.[provider];
    if (savedModel) {
      elements.aiModel.value = savedModel;
    } else {
      elements.aiModel.value = providerInfo.defaultModel;
    }
  }

  /**
   * Render keybinds UI
   * @param {Object} keybinds - Keybind settings
   */
  function renderKeybinds(keybinds) {
    const labels = storage.getKeybindLabels();
    const container = elements.keybindsContainer;
    container.innerHTML = '';

    for (const [action, keybind] of Object.entries(keybinds)) {
      const label = labels[action] || action;
      const formatted = storage.formatKeybind(keybind);

      const row = document.createElement('div');
      row.className = 'keybind-row';
      row.innerHTML = `
        <span class="keybind-label">${label}</span>
        <div class="keybind-key">
          <button class="keybind-value" data-action="${action}" title="Click to change">${formatted}</button>
          <button class="keybind-reset" data-action="${action}" title="Reset to default">Reset</button>
        </div>
      `;
      container.appendChild(row);
    }

    // Attach keybind event listeners
    container.querySelectorAll('.keybind-value').forEach((btn) => {
      btn.addEventListener('click', () => openKeybindModal(btn.dataset.action));
    });

    container.querySelectorAll('.keybind-reset').forEach((btn) => {
      btn.addEventListener('click', () => resetSingleKeybind(btn.dataset.action));
    });
  }

  /**
   * Attach event listeners
   */
  function attachEventListeners() {
    // General settings
    elements.autoSearch.addEventListener('change', () => saveSetting('autoSearch', elements.autoSearch.checked));
    elements.searchDelay.addEventListener('change', () => saveSetting('searchDelay', parseInt(elements.searchDelay.value, 10)));

    // Appearance settings
    elements.theme.addEventListener('change', () => saveSetting('theme', elements.theme.value));

    elements.highlightColor.addEventListener('input', () => {
      elements.highlightColorText.value = elements.highlightColor.value;
    });
    elements.highlightColor.addEventListener('change', () => {
      saveSetting('highlightColor', elements.highlightColor.value);
    });
    elements.highlightColorText.addEventListener('change', () => {
      const color = elements.highlightColorText.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
        elements.highlightColor.value = color;
        saveSetting('highlightColor', color);
      }
    });

    elements.highlightCurrentColor.addEventListener('input', () => {
      elements.highlightCurrentColorText.value = elements.highlightCurrentColor.value;
    });
    elements.highlightCurrentColor.addEventListener('change', () => {
      saveSetting('highlightCurrentColor', elements.highlightCurrentColor.value);
    });
    elements.highlightCurrentColorText.addEventListener('change', () => {
      const color = elements.highlightCurrentColorText.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
        elements.highlightCurrentColor.value = color;
        saveSetting('highlightCurrentColor', color);
      }
    });

    elements.highlightOpacity.addEventListener('input', () => {
      elements.highlightOpacityValue.textContent = elements.highlightOpacity.value;
    });
    elements.highlightOpacity.addEventListener('change', () => {
      saveSetting('highlightOpacity', parseFloat(elements.highlightOpacity.value));
    });

    // Search defaults
    elements.caseSensitive.addEventListener('change', () => saveSetting('caseSensitive', elements.caseSensitive.checked));
    elements.wholeWord.addEventListener('change', () => saveSetting('wholeWord', elements.wholeWord.checked));

    // Reset keybinds
    elements.resetKeybinds.addEventListener('click', resetAllKeybinds);

    // Import/Export
    elements.exportSettings.addEventListener('click', exportSettings);
    elements.importSettings.addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', importSettings);

    // AI Settings
    elements.aiProvider.addEventListener('change', handleProviderChange);
    elements.aiModel.addEventListener('change', handleModelChange);
    elements.openaiKey.addEventListener('change', () => saveAPIKey('openai', elements.openaiKey.value));
    elements.anthropicKey.addEventListener('change', () => saveAPIKey('anthropic', elements.anthropicKey.value));
    elements.googleKey.addEventListener('change', () => saveAPIKey('google', elements.googleKey.value));
    elements.aiTemperature.addEventListener('input', () => {
      elements.aiTemperatureValue.textContent = elements.aiTemperature.value;
    });
    elements.aiTemperature.addEventListener('change', () => saveAISetting('temperature', parseFloat(elements.aiTemperature.value)));
    elements.aiToolApproval.addEventListener('change', () => saveAISetting('toolApproval', elements.aiToolApproval.value));

    // AI Suggestions
    elements.addSuggestion.addEventListener('click', addAISuggestion);
    elements.resetSuggestions.addEventListener('click', resetAISuggestions);

    // API Key visibility toggles
    document.querySelectorAll('.toggle-visibility').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
        }
      });
    });

    // Test connection buttons
    document.querySelectorAll('.test-connection').forEach(btn => {
      btn.addEventListener('click', () => testProviderConnection(btn.dataset.provider, btn));
    });

    // Reset all
    elements.resetAll.addEventListener('click', resetAllSettings);

    // Modal
    elements.keybindModalCancel.addEventListener('click', closeKeybindModal);
    elements.keybindModalSave.addEventListener('click', saveKeybind);

    // Close modal on background click
    elements.keybindModal.addEventListener('click', (e) => {
      if (e.target === elements.keybindModal) {
        closeKeybindModal();
      }
    });

    // Global keyboard listener for modal
    document.addEventListener('keydown', handleModalKeydown);
  }

  /**
   * Save a single setting
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  async function saveSetting(key, value) {
    try {
      await storage.set(key, value);
      showStatus('Settings saved', 'success');
    } catch (e) {
      console.error('Failed to save setting:', e);
      showStatus('Failed to save settings', 'error');
    }
  }

  /**
   * Open keybind capture modal
   * @param {string} action - Keybind action
   */
  function openKeybindModal(action) {
    const labels = storage.getKeybindLabels();
    editingKeybind = action;
    capturedKeybind = null;

    elements.keybindModalAction.textContent = labels[action] || action;
    elements.keybindModalCapture.textContent = 'Press any key combination...';
    elements.keybindModalCapture.classList.remove('active');
    elements.keybindModalConflict.hidden = true;
    elements.keybindModalSave.disabled = true;

    elements.keybindModal.hidden = false;
    elements.keybindModal.focus();
  }

  /**
   * Close keybind modal
   */
  function closeKeybindModal() {
    elements.keybindModal.hidden = true;
    editingKeybind = null;
    capturedKeybind = null;
  }

  /**
   * Handle keydown in modal for keybind capture
   * @param {KeyboardEvent} e - Keyboard event
   */
  async function handleModalKeydown(e) {
    if (elements.keybindModal.hidden) return;

    e.preventDefault();
    e.stopPropagation();

    // Escape closes modal
    if (e.key === 'Escape') {
      closeKeybindModal();
      return;
    }

    // Ignore modifier-only keypresses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return;
    }

    // Capture the keybind
    capturedKeybind = storage.eventToKeybind(e);
    const formatted = storage.formatKeybind(capturedKeybind);

    elements.keybindModalCapture.textContent = formatted;
    elements.keybindModalCapture.classList.add('active');

    // Check for conflicts
    const conflict = await storage.checkKeybindConflict(editingKeybind, capturedKeybind);
    if (conflict) {
      const labels = storage.getKeybindLabels();
      elements.keybindModalConflict.textContent = `Conflicts with: ${labels[conflict] || conflict}`;
      elements.keybindModalConflict.hidden = false;
      elements.keybindModalSave.disabled = true;
    } else {
      elements.keybindModalConflict.hidden = true;
      elements.keybindModalSave.disabled = false;
    }
  }

  /**
   * Save captured keybind
   */
  async function saveKeybind() {
    if (!editingKeybind || !capturedKeybind) return;

    try {
      await storage.set(`keybinds.${editingKeybind}`, capturedKeybind);
      const settings = await storage.getSettings();
      renderKeybinds(settings.keybinds);
      closeKeybindModal();
      showStatus('Shortcut updated', 'success');
    } catch (e) {
      console.error('Failed to save keybind:', e);
      showStatus('Failed to save shortcut', 'error');
    }
  }

  /**
   * Reset a single keybind
   * @param {string} action - Keybind action
   */
  async function resetSingleKeybind(action) {
    try {
      await storage.resetKeybind(action);
      const settings = await storage.getSettings();
      renderKeybinds(settings.keybinds);
      showStatus('Shortcut reset', 'success');
    } catch (e) {
      console.error('Failed to reset keybind:', e);
      showStatus('Failed to reset shortcut', 'error');
    }
  }

  /**
   * Reset all keybinds
   */
  async function resetAllKeybinds() {
    if (!confirm('Reset all keyboard shortcuts to defaults?')) return;

    try {
      await storage.resetAllKeybinds();
      const settings = await storage.getSettings();
      renderKeybinds(settings.keybinds);
      showStatus('All shortcuts reset', 'success');
    } catch (e) {
      console.error('Failed to reset keybinds:', e);
      showStatus('Failed to reset shortcuts', 'error');
    }
  }

  /**
   * Export settings to file
   */
  async function exportSettings() {
    try {
      const json = await storage.exportSettings();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `locate-settings-${new Date().toISOString().split('T')[0]}.json`;
      a.click();

      URL.revokeObjectURL(url);
      showStatus('Settings exported', 'success');
    } catch (e) {
      console.error('Failed to export settings:', e);
      showStatus('Failed to export settings', 'error');
    }
  }

  /**
   * Import settings from file
   * @param {Event} e - Change event
   */
  async function importSettings(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const success = await storage.importSettings(text);

      if (success) {
        await loadSettings();
        showStatus('Settings imported', 'success');
      } else {
        showStatus('Invalid settings file', 'error');
      }
    } catch (err) {
      console.error('Failed to import settings:', err);
      showStatus('Failed to import settings', 'error');
    }

    // Reset file input
    e.target.value = '';
  }

  /**
   * Reset all settings
   */
  async function resetAllSettings() {
    if (!confirm('Reset ALL settings to defaults? This cannot be undone.')) return;

    try {
      await storage.resetToDefaults();
      await loadSettings();
      showStatus('All settings reset', 'success');
    } catch (e) {
      console.error('Failed to reset settings:', e);
      showStatus('Failed to reset settings', 'error');
    }
  }

  /**
   * Show status message
   * @param {string} message - Status message
   * @param {string} type - 'success' or 'error'
   */
  function showStatus(message, type = 'success') {
    elements.statusMessage.textContent = message;
    elements.statusBar.className = `status-bar visible ${type}`;

    // Hide after 2 seconds
    setTimeout(() => {
      elements.statusBar.classList.remove('visible');
    }, 2000);
  }

  /**
   * Handle AI provider change
   */
  async function handleProviderChange() {
    const provider = elements.aiProvider.value;
    const settings = await storage.getSettings();

    // Update model dropdown
    updateModelDropdown(provider, settings.ai?.models);

    // Save provider selection
    await saveAISetting('provider', provider);
  }

  /**
   * Handle AI model change
   */
  async function handleModelChange() {
    const provider = elements.aiProvider.value;
    const model = elements.aiModel.value;

    const settings = await storage.getSettings();
    const models = settings.ai?.models || {};
    models[provider] = model;

    await saveAISetting('models', models);
  }

  /**
   * Save an API key
   * @param {string} provider - Provider name
   * @param {string} key - API key
   */
  async function saveAPIKey(provider, key) {
    try {
      const settings = await storage.getSettings();
      const apiKeys = settings.ai?.apiKeys || {};
      apiKeys[provider] = key;
      await saveAISetting('apiKeys', apiKeys);
      showStatus('API key saved', 'success');
    } catch (e) {
      console.error('Failed to save API key:', e);
      showStatus('Failed to save API key', 'error');
    }
  }

  /**
   * Save an AI setting
   * @param {string} key - Setting key within ai object
   * @param {any} value - Setting value
   */
  async function saveAISetting(key, value) {
    try {
      const settings = await storage.getSettings();
      const ai = settings.ai || {};
      ai[key] = value;
      await storage.set('ai', ai);
      showStatus('Settings saved', 'success');
    } catch (e) {
      console.error('Failed to save AI setting:', e);
      showStatus('Failed to save settings', 'error');
    }
  }

  /**
   * Test connection for a provider
   * @param {string} provider - Provider name
   * @param {HTMLButtonElement} btn - The button element
   */
  async function testProviderConnection(provider, btn) {
    const keyInput = {
      openai: elements.openaiKey,
      anthropic: elements.anthropicKey,
      google: elements.googleKey
    }[provider];

    const apiKey = keyInput?.value;
    if (!apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }

    btn.classList.add('testing');
    btn.textContent = '...';

    try {
      // Send test request to background script
      const response = await chrome.runtime.sendMessage({
        action: 'testAIConnection',
        provider,
        apiKey
      });

      if (response.success) {
        btn.classList.remove('testing');
        btn.classList.add('success');
        btn.textContent = '✓';
        showStatus(`${aiProviders[provider]?.name || provider} connection successful!`, 'success');
      } else {
        btn.classList.remove('testing');
        btn.classList.add('error');
        btn.textContent = '✗';
        showStatus(response.error || 'Connection failed', 'error');
      }
    } catch (e) {
      btn.classList.remove('testing');
      btn.classList.add('error');
      btn.textContent = '✗';
      showStatus('Connection test failed', 'error');
    }

    // Reset button after 3 seconds
    setTimeout(() => {
      btn.classList.remove('success', 'error');
      btn.textContent = 'Test';
    }, 3000);
  }

  /**
   * Render AI suggestions list
   * @param {Array} suggestions - Array of {title, prompt} objects
   */
  function renderAISuggestions(suggestions) {
    const container = elements.aiSuggestionsContainer;
    container.innerHTML = '';

    if (!suggestions || suggestions.length === 0) {
      container.innerHTML = '<div class="ai-suggestions-empty">No suggestions configured. Click "Add Suggestion" to create one.</div>';
      return;
    }

    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 'ai-suggestion-item';
      item.dataset.index = index;

      item.innerHTML = `
        <div class="ai-suggestion-item-header">
          <span class="ai-suggestion-item-number">#${index + 1}</span>
          <button type="button" class="ai-suggestion-remove" title="Remove suggestion" data-index="${index}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
            </svg>
          </button>
        </div>
        <div class="ai-suggestion-inputs">
          <div class="ai-suggestion-row">
            <label>Title</label>
            <input type="text" class="ai-suggestion-title" value="${escapeHtml(suggestion.title || '')}" placeholder="Button label" data-index="${index}">
          </div>
          <div class="ai-suggestion-row">
            <label>Prompt</label>
            <textarea class="ai-suggestion-prompt" placeholder="The prompt to send to the AI" data-index="${index}">${escapeHtml(suggestion.prompt || '')}</textarea>
          </div>
        </div>
      `;

      container.appendChild(item);
    });

    // Attach event listeners to inputs
    container.querySelectorAll('.ai-suggestion-title').forEach(input => {
      input.addEventListener('change', handleSuggestionChange);
    });

    container.querySelectorAll('.ai-suggestion-prompt').forEach(input => {
      input.addEventListener('change', handleSuggestionChange);
    });

    container.querySelectorAll('.ai-suggestion-remove').forEach(btn => {
      btn.addEventListener('click', () => removeAISuggestion(parseInt(btn.dataset.index, 10)));
    });
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Handle suggestion input change
   * @param {Event} e - Change event
   */
  async function handleSuggestionChange(e) {
    const index = parseInt(e.target.dataset.index, 10);
    const isTitle = e.target.classList.contains('ai-suggestion-title');

    const settings = await storage.getSettings();
    const defaultSuggestions = window.LocateDefaultAISettings?.suggestions || [];
    const suggestions = [...(settings.ai?.suggestions || defaultSuggestions)];

    if (suggestions[index]) {
      if (isTitle) {
        suggestions[index].title = e.target.value;
      } else {
        suggestions[index].prompt = e.target.value;
      }

      await saveAISetting('suggestions', suggestions);
    }
  }

  /**
   * Add a new AI suggestion
   */
  async function addAISuggestion() {
    const settings = await storage.getSettings();
    const defaultSuggestions = window.LocateDefaultAISettings?.suggestions || [];
    const suggestions = [...(settings.ai?.suggestions || defaultSuggestions)];

    suggestions.push({ title: '', prompt: '' });

    await saveAISetting('suggestions', suggestions);
    renderAISuggestions(suggestions);

    // Focus the new title input
    const newInput = elements.aiSuggestionsContainer.querySelector('.ai-suggestion-item:last-child .ai-suggestion-title');
    if (newInput) {
      newInput.focus();
    }
  }

  /**
   * Remove an AI suggestion
   * @param {number} index - Index of suggestion to remove
   */
  async function removeAISuggestion(index) {
    const settings = await storage.getSettings();
    const defaultSuggestions = window.LocateDefaultAISettings?.suggestions || [];
    const suggestions = [...(settings.ai?.suggestions || defaultSuggestions)];

    if (index >= 0 && index < suggestions.length) {
      suggestions.splice(index, 1);
      await saveAISetting('suggestions', suggestions);
      renderAISuggestions(suggestions);
    }
  }

  /**
   * Reset AI suggestions to defaults
   */
  async function resetAISuggestions() {
    if (!confirm('Reset all suggestions to defaults?')) return;

    const defaultSuggestions = window.LocateDefaultAISettings?.suggestions || [];
    await saveAISetting('suggestions', [...defaultSuggestions]);
    renderAISuggestions(defaultSuggestions);
    showStatus('Suggestions reset to defaults', 'success');
  }

  // Initialise when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
