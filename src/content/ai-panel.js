/**
 * Locate - AI Chat Panel
 * In-page side panel for AI-powered assistance
 */

class AIPanel {
  constructor() {
    this.panel = null;
    this.messagesContainer = null;
    this.input = null;
    this.isVisible = false;
    this.isLoading = false;
    this.abortController = null; // For cancelling in-flight requests
    this.context = {};
    this.messages = [];
    this.settings = null;
    this.conversationId = 'main-' + Date.now(); // Unique ID for this conversation

    // Streaming state
    this.streamingContent = '';
    this.streamingElement = null;

    // Input history for up/down arrow navigation
    this.inputHistory = [];
    this.inputHistoryIndex = -1;
    this.inputHistoryTemp = ''; // Stores current input when navigating

    // File attachments state
    this.attachments = [];
    this.MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    this.IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    this.TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.js', '.ts', '.css', '.html', '.xml', '.csv', '.log', '.py', '.rb', '.java', '.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.php', '.sql', '.yaml', '.yml', '.sh', '.bat'];

    // Tool execution safeguards
    this.toolRecursionDepth = 0;
    this.MAX_TOOL_RECURSION = 5; // Prevent infinite loops
    this.isProcessingToolResult = false;

    this.init();
  }

  /**
   * Initialize the AI panel
   */
  init() {
    this.createPanel();
    this.attachEventListeners();
    this.loadSettings();

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.settings) {
        this.settings = changes.settings.newValue?.ai || {};
        this.renderSuggestions();
      }
    });

    // Listen for streaming chunks from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'aiStreamChunk' && this.isLoading) {
        this.handleStreamChunk(message.chunk);
      } else if (message.action === 'aiStreamEnd' && this.isLoading) {
        this.handleStreamEnd();
      } else if (message.action === 'aiError' && this.isLoading) {
        this.handleStreamError(message.error);
      }
    });
  }

  /**
   * Load AI settings from storage
   */
  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get('settings');
      this.settings = result.settings?.ai || {};
      this.renderSuggestions();
    } catch (e) {
      console.log('Locate: Could not load AI settings', e);
    }
  }

  /**
   * Render suggestion buttons from settings
   */
  renderSuggestions() {
    if (!this.suggestionsContainer) return;

    // Default suggestions if none configured
    const defaultSuggestions = [
      { title: 'Count links', prompt: 'How many links are on this page?' },
      { title: 'Find headings', prompt: 'List all the headings of the page in a tree' },
      { title: 'Summarize page', prompt: 'Summarize the main content of this page' },
      { title: 'Turn into Tweet', prompt: 'Turn the contents of this page into someething that can be shared as a catchy Tweet' }
    ];

    const suggestions = this.settings?.suggestions || defaultSuggestions;

    // Filter out empty suggestions
    const validSuggestions = suggestions.filter(s => s.title && s.prompt);

    this.suggestionsContainer.innerHTML = validSuggestions.map(suggestion =>
      `<button class="locate-ai-suggestion" data-prompt="${this.escapeAttr(suggestion.prompt)}">${this.escapeHtml(suggestion.title)}</button>`
    ).join('');

    // Re-attach event listeners
    this.suggestionsContainer.querySelectorAll('.locate-ai-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        this.input.value = btn.dataset.prompt;
        this.handleInputChange();
        this.input.focus();
      });
    });
  }

  /**
   * Escape HTML for text content
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /**
   * Escape string for use in HTML attribute
   */
  escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Create the panel DOM structure
   */
  createPanel() {
    this.panel = document.createElement('div');
    this.panel.id = 'locate-ai-panel';
    this.panel.className = 'locate-ai-panel';

    this.panel.innerHTML = `
      <div class="locate-ai-panel-content">
        <div class="locate-ai-header">
          <div class="locate-ai-title">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"/>
              <path d="M8 4a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 8 4z"/>
            </svg>
            <span>AI Assistant</span>
          </div>
          <div class="locate-ai-header-controls">
            <button class="locate-ai-btn locate-ai-btn-clear" title="Clear conversation" aria-label="Clear conversation">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
              </svg>
            </button>
            <button class="locate-ai-btn locate-ai-btn-close" title="Close (Escape)" aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 6.586L11.293 3.293l1.414 1.414L9.414 8l3.293 3.293-1.414 1.414L8 9.414l-3.293 3.293-1.414-1.414L6.586 8 3.293 4.707l1.414-1.414L8 6.586z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="locate-ai-messages">
          <div class="locate-ai-welcome">
            <p>Ask me anything about this page.</p>
            <div class="locate-ai-suggestions">
              <!-- Suggestions loaded dynamically from settings -->
            </div>
          </div>
        </div>
        <div class="locate-ai-input-area">
          <div class="locate-ai-no-api-key" style="display: none;">
            <p>Configure your API key in <a href="#" class="locate-ai-settings-link">settings</a> to use AI features.</p>
          </div>
          <input type="file" class="locate-ai-file-input" multiple accept="image/*,.txt,.md,.json,.js,.ts,.css,.html,.xml,.csv,.log,.py,.rb,.java,.c,.cpp,.h,.hpp,.go,.rs,.php,.sql,.yaml,.yml,.sh,.bat" style="display: none;">
          <div class="locate-ai-input-wrapper">
            <div class="locate-ai-attachments-preview" style="display: none;">
              <div class="locate-ai-attachments-list"></div>
            </div>
            <textarea
              class="locate-ai-input"
              placeholder="How can I help you today?"
              rows="1"
              aria-label="Message input"
            ></textarea>
            <div class="locate-ai-input-toolbar">
              <div class="locate-ai-toolbar-left">
                <button class="locate-ai-btn locate-ai-toolbar-btn locate-ai-btn-attach" title="Add files (images, text)" aria-label="Add files">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
                  </svg>
                </button>
                <select class="locate-ai-model-select" aria-label="Select AI model">
                  <option value="">No AI configured</option>
                </select>
                <button class="locate-ai-btn locate-ai-toolbar-btn locate-ai-btn-settings" title="AI Settings" aria-label="AI Settings">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
                    <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
                  </svg>
                </button>
              </div>
              <div class="locate-ai-toolbar-right">
                <button class="locate-ai-btn locate-ai-btn-send" title="Send message" aria-label="Send" disabled>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0L6.59 1.41 12.17 7H0v2h12.17l-5.58 5.59L8 16l8-8-8-8z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.panel);

    // Get element references
    this.messagesContainer = this.panel.querySelector('.locate-ai-messages');
    this.input = this.panel.querySelector('.locate-ai-input');
    this.sendBtn = this.panel.querySelector('.locate-ai-btn-send');
    this.clearBtn = this.panel.querySelector('.locate-ai-btn-clear');
    this.closeBtn = this.panel.querySelector('.locate-ai-btn-close');
    this.noApiKeyMessage = this.panel.querySelector('.locate-ai-no-api-key');
    this.modelSelect = this.panel.querySelector('.locate-ai-model-select');
    this.settingsLink = this.panel.querySelector('.locate-ai-settings-link');
    this.welcome = this.panel.querySelector('.locate-ai-welcome');

    // File attachment elements
    this.attachBtn = this.panel.querySelector('.locate-ai-btn-attach');
    this.fileInput = this.panel.querySelector('.locate-ai-file-input');
    this.attachmentsPreview = this.panel.querySelector('.locate-ai-attachments-preview');
    this.attachmentsList = this.panel.querySelector('.locate-ai-attachments-list');
    this.inputArea = this.panel.querySelector('.locate-ai-input-area');
    this.toolbarSettingsBtn = this.panel.querySelector('.locate-ai-btn-settings');
    this.suggestionsContainer = this.panel.querySelector('.locate-ai-suggestions');
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Input handling
    this.input.addEventListener('input', () => this.handleInputChange());
    this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Button clicks
    this.sendBtn.addEventListener('click', () => {
      if (this.isLoading) {
        this.stopGeneration();
      } else {
        this.sendMessage();
      }
    });
    this.clearBtn.addEventListener('click', () => this.clearConversation());
    this.closeBtn.addEventListener('click', () => this.hide());

    // Settings link
    this.settingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'openOptions' });
    });

    // Model selector
    this.modelSelect.addEventListener('change', () => {
      this.handleModelChange();
      this.autosizeModelSelect();
    });

    // Toolbar settings button
    this.toolbarSettingsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openOptions' });
    });

    // File attachment handling
    this.attachBtn.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.input.addEventListener('paste', (e) => this.handlePaste(e));

    // Drag and drop on input area
    this.inputArea.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.inputArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    this.inputArea.addEventListener('drop', (e) => this.handleDrop(e));

    // Global escape to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        e.preventDefault();
        this.hide();
      }
    });

    // Prevent clicks inside panel from closing it
    this.panel.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }

  /**
   * Handle input changes
   */
  handleInputChange() {
    // Auto-resize textarea
    this.input.style.height = 'auto';
    this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px';

    // Enable/disable send button (also enable if there are attachments)
    this.sendBtn.disabled = (!this.input.value.trim() && this.attachments.length === 0) || this.isLoading;
  }

  // ==========================================
  // File Attachment Handling
  // ==========================================

  /**
   * Handle file selection from input
   */
  handleFileSelect(e) {
    const files = Array.from(e.target.files);
    this.processFiles(files);
    e.target.value = ''; // Reset so same file can be selected again
  }

  /**
   * Handle drag over event
   */
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    this.inputArea.classList.add('drag-over');
  }

  /**
   * Handle drag leave event
   */
  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!this.inputArea.contains(e.relatedTarget)) {
      this.inputArea.classList.remove('drag-over');
    }
  }

  /**
   * Handle file drop
   */
  handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.inputArea.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      this.processFiles(files);
    }
  }

  /**
   * Handle paste event for files
   */
  handlePaste(e) {
    const items = Array.from(e.clipboardData?.items || []);
    const files = items
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter(Boolean);

    if (files.length > 0) {
      e.preventDefault();
      this.processFiles(files);
    }
  }

  /**
   * Process uploaded files
   */
  async processFiles(files) {
    for (const file of files) {
      // Check file size
      if (file.size > this.MAX_FILE_SIZE) {
        this.showFileError(`File "${file.name}" is too large (max 10MB)`);
        continue;
      }

      // Check if file is already attached
      if (this.attachments.some(a => a.name === file.name && a.size === file.size)) {
        continue;
      }

      const isImage = this.IMAGE_TYPES.includes(file.type);
      const isText = this.isTextFile(file.name);

      if (!isImage && !isText) {
        this.showFileError(`File type not supported: ${file.name}`);
        continue;
      }

      try {
        const attachment = await this.readFile(file, isImage);
        this.attachments.push(attachment);
      } catch (error) {
        this.showFileError(`Failed to read file: ${file.name}`);
      }
    }

    this.renderAttachments();
    this.handleInputChange();
  }

  /**
   * Check if file is a text file based on extension
   */
  isTextFile(filename) {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    return this.TEXT_EXTENSIONS.includes(ext);
  }

  /**
   * Read file and return attachment object
   */
  readFile(file, isImage) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const attachment = {
          name: file.name,
          type: file.type || 'text/plain',
          size: file.size,
          isImage
        };

        if (isImage) {
          attachment.dataUrl = reader.result;
        } else {
          attachment.content = reader.result;
        }

        resolve(attachment);
      };

      reader.onerror = () => reject(reader.error);

      if (isImage) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  }

  /**
   * Render attachments preview
   */
  renderAttachments() {
    if (this.attachments.length === 0) {
      this.attachmentsPreview.style.display = 'none';
      this.attachmentsList.innerHTML = '';
      return;
    }

    this.attachmentsPreview.style.display = 'block';

    this.attachmentsList.innerHTML = this.attachments.map((attachment, index) => {
      if (attachment.isImage) {
        return `
          <div class="locate-ai-attachment-item is-image" data-index="${index}">
            <img src="${attachment.dataUrl}" alt="${attachment.name}" class="locate-ai-attachment-thumbnail">
            <div class="locate-ai-attachment-info">
              <span class="locate-ai-attachment-name" title="${attachment.name}">${attachment.name}</span>
              <button class="locate-ai-attachment-remove" title="Remove" data-index="${index}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="locate-ai-attachment-item" data-index="${index}">
            <svg class="locate-ai-attachment-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            <span class="locate-ai-attachment-name" title="${attachment.name}">${attachment.name}</span>
            <button class="locate-ai-attachment-remove" title="Remove" data-index="${index}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        `;
      }
    }).join('');

    // Add remove handlers
    this.attachmentsList.querySelectorAll('.locate-ai-attachment-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        this.removeAttachment(index);
      });
    });
  }

  /**
   * Remove attachment by index
   */
  removeAttachment(index) {
    this.attachments.splice(index, 1);
    this.renderAttachments();
    this.handleInputChange();
  }

  /**
   * Clear all attachments
   */
  clearAttachments() {
    this.attachments = [];
    this.renderAttachments();
  }

  /**
   * Show file error message (temporary toast)
   */
  showFileError(message) {
    const errorEl = document.createElement('div');
    errorEl.className = 'locate-ai-file-error';
    errorEl.textContent = message;
    this.panel.appendChild(errorEl);

    setTimeout(() => errorEl.remove(), 3000);
  }

  /**
   * Handle keydown in input
   * @param {KeyboardEvent} e
   */
  handleKeyDown(e) {
    // Handle history navigation with ArrowUp/ArrowDown
    if (e.key === 'ArrowUp' && this.input.selectionStart === 0 && this.input.selectionEnd === 0) {
      if (this.inputHistory.length > 0 && (this.inputHistoryIndex === -1 || this.inputHistoryIndex > 0)) {
        e.preventDefault();
        this.navigateInputHistory('back');
        return;
      }
    }
    if (e.key === 'ArrowDown' && this.input.selectionStart === this.input.value.length && this.input.selectionEnd === this.input.value.length) {
      if (this.inputHistoryIndex !== -1) {
        e.preventDefault();
        this.navigateInputHistory('forward');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (this.input.value.trim() && !this.isLoading) {
        this.sendMessage();
      }
    }
  }

  /**
   * Navigate through input history
   * @param {string} direction - 'back' or 'forward'
   */
  navigateInputHistory(direction) {
    if (this.inputHistory.length === 0) return;

    // Save current input when starting to navigate
    if (this.inputHistoryIndex === -1) {
      this.inputHistoryTemp = this.input.value;
    }

    if (direction === 'back') {
      if (this.inputHistoryIndex === -1) {
        // Start from most recent, skip if same as current
        let startIndex = this.inputHistory.length - 1;
        while (startIndex >= 0 && this.inputHistory[startIndex] === this.input.value) {
          startIndex--;
        }
        if (startIndex >= 0) {
          this.inputHistoryIndex = startIndex;
          this.input.value = this.inputHistory[this.inputHistoryIndex];
        }
      } else if (this.inputHistoryIndex > 0) {
        this.inputHistoryIndex--;
        this.input.value = this.inputHistory[this.inputHistoryIndex];
      }
    } else {
      if (this.inputHistoryIndex !== -1) {
        this.inputHistoryIndex++;
        if (this.inputHistoryIndex >= this.inputHistory.length) {
          this.inputHistoryIndex = -1;
          this.input.value = this.inputHistoryTemp;
        } else {
          this.input.value = this.inputHistory[this.inputHistoryIndex];
        }
      }
    }

    // Move cursor to end and resize
    this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    this.handleInputChange();
  }

  /**
   * Add a message to input history
   * @param {string} message - The message to add
   */
  addToInputHistory(message) {
    if (!message || !message.trim()) return;

    // Don't add duplicates of the last entry
    if (this.inputHistory.length > 0 && this.inputHistory[this.inputHistory.length - 1] === message) {
      return;
    }

    this.inputHistory.push(message);

    // Limit history size
    if (this.inputHistory.length > 100) {
      this.inputHistory.shift();
    }

    // Reset navigation state
    this.inputHistoryIndex = -1;
    this.inputHistoryTemp = '';
  }

  /**
   * Send a message to the AI
   * @param {string} userMessage - Optional message to send (if not from input)
   * @param {boolean} isToolResult - Whether this is a tool result being sent back
   */
  async sendMessage(userMessage = null, isToolResult = false) {
    const content = userMessage || this.input.value.trim();
    if (!content && this.attachments.length === 0) return;

    // Block user messages while loading, but allow tool results through
    if (this.isLoading && !isToolResult) return;

    // Prevent duplicate tool result processing
    if (isToolResult && this.isProcessingToolResult) {
      console.log('Locate: Blocking duplicate tool result processing');
      return;
    }

    // Check tool recursion depth to prevent infinite loops
    if (isToolResult) {
      this.toolRecursionDepth++;
      if (this.toolRecursionDepth > this.MAX_TOOL_RECURSION) {
        console.warn('Locate: Maximum tool recursion depth reached, stopping');
        this.addMessage('system', 'Tool execution limit reached. Please continue the conversation manually.');
        this.toolRecursionDepth = 0;
        return;
      }
      this.isProcessingToolResult = true;
    } else {
      // Reset recursion depth on new user message
      this.toolRecursionDepth = 0;
    }

    // Capture current attachments before clearing
    const messageAttachments = [...this.attachments];

    // Hide welcome message
    this.welcome.style.display = 'none';
    this.noApiKeyMessage.style.display = 'none';

    // Add user message (but not tool results - those show differently)
    if (!isToolResult) {
      this.addToInputHistory(content);
      this.addMessage('user', content, messageAttachments);
      this.input.value = '';
      this.clearAttachments();
      this.handleInputChange();
    }

    // Show loading state and prepare for streaming
    this.setLoading(true);
    this.streamingContent = '';
    this.streamingElement = null;
    const loadingEl = this.addLoadingIndicator();

    // Create abort controller for this request
    this.abortController = new AbortController();

    try {
      // Prepare attachments for API
      const apiAttachments = messageAttachments.map(att => ({
        name: att.name,
        type: att.type,
        isImage: att.isImage,
        dataUrl: att.dataUrl,
        content: att.content
      }));

      // Send to background script - streaming will be handled by message listener
      const response = await chrome.runtime.sendMessage({
        action: 'sendAIMessage',
        conversationId: this.conversationId,
        message: content || '(See attached files)',
        attachments: apiAttachments,
        context: this.context
      });

      // Check if aborted
      if (this.abortController?.signal.aborted) {
        return;
      }

      if (response.error) {
        // Remove streaming element if there is one
        if (this.streamingElement) {
          this.streamingElement.remove();
          this.streamingElement = null;
        }
        this.addMessage('error', response.error);
      } else {
        // The streaming has already shown the content, now handle tool calls
        const toolCalls = this.extractToolCalls(response.content);

        if (toolCalls.length > 0) {
          // Update the streaming element to show only the clean content
          const cleanContent = this.stripToolCalls(response.content);
          if (this.streamingElement) {
            if (cleanContent.trim()) {
              const contentEl = this.streamingElement.querySelector('.locate-ai-message-content');
              if (contentEl) {
                contentEl.innerHTML = this.formatContent(cleanContent);
              }
            } else {
              // No clean content, remove the streaming element
              this.streamingElement.remove();
            }
            this.streamingElement = null;
          }

          // Store the final message in history
          this.messages.push({ role: 'assistant', content: response.content });

          // Execute tool calls (with approval if needed)
          await this.handleToolCalls(toolCalls);
        } else {
          // No tool calls - streaming element already shows the final content
          // Just make sure we store it in history
          if (this.streamingElement) {
            this.messages.push({ role: 'assistant', content: response.content });
            this.streamingElement = null;
          }
        }
      }
    } catch (error) {
      // Remove streaming element if there is one
      if (this.streamingElement) {
        this.streamingElement.remove();
        this.streamingElement = null;
      }
      // Don't show error if it was an abort
      if (error.name !== 'AbortError' && !this.abortController?.signal.aborted) {
        this.addMessage('error', 'Failed to get response: ' + error.message);
      }
    } finally {
      this.abortController = null;
      this.streamingContent = '';
      this.setLoading(false);
      this.isProcessingToolResult = false;
    }
  }

  /**
   * Handle a streaming chunk from the AI
   * @param {string} chunk
   */
  handleStreamChunk(chunk) {
    this.streamingContent += chunk;

    // Create streaming element if it doesn't exist (first chunk)
    if (!this.streamingElement) {
      // Remove loading indicator now that we have content
      const loadingEl = this.messagesContainer.querySelector('.locate-ai-message-loading');
      if (loadingEl) {
        loadingEl.remove();
      }

      this.streamingElement = document.createElement('div');
      this.streamingElement.className = 'locate-ai-message locate-ai-message-assistant locate-ai-message-streaming';

      const contentEl = document.createElement('div');
      contentEl.className = 'locate-ai-message-content';
      this.streamingElement.appendChild(contentEl);

      this.messagesContainer.appendChild(this.streamingElement);
    }

    // Check if we're currently inside a tool_call tag (incomplete tag)
    const hasOpenToolCall = this.streamingContent.includes('<tool_call>') &&
                            !this.streamingContent.includes('</tool_call>');

    // Update content (strip any complete tool calls from display while streaming)
    let displayContent = this.stripToolCalls(this.streamingContent);

    // If there's an incomplete tool_call, strip that partial content too
    if (hasOpenToolCall) {
      displayContent = displayContent.replace(/<tool_call>[\s\S]*$/, '').trim();
    }

    const contentEl = this.streamingElement.querySelector('.locate-ai-message-content');
    if (contentEl) {
      let html = displayContent ? this.formatContent(displayContent) : '';

      // Show tool preparation indicator if we're in a tool call
      if (hasOpenToolCall) {
        html += `<div class="locate-ai-tool-preparing">
          <span class="locate-ai-tool-preparing-icon">⚙️</span>
          <span>Preparing to run code...</span>
        </div>`;
      }

      contentEl.innerHTML = html;
    }

    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Handle streaming completion
   */
  handleStreamEnd() {
    // Streaming is complete - the sendMessage promise will resolve
    // and handle any remaining logic (tool calls, etc.)
    if (this.streamingElement) {
      this.streamingElement.classList.remove('locate-ai-message-streaming');
    }
  }

  /**
   * Handle streaming error
   * @param {string} error
   */
  handleStreamError(error) {
    // Remove streaming element if exists
    if (this.streamingElement) {
      this.streamingElement.remove();
      this.streamingElement = null;
    }
    this.streamingContent = '';
  }

  /**
   * Extract tool calls from AI response
   * @param {string} content - AI response content
   * @returns {Array} Array of tool call objects
   */
  extractToolCalls(content) {
    const toolCalls = [];
    // Match everything between <tool_call> tags
    const regex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
    let match;

    while ((match = regex.exec(content)) !== null) {
      let jsonStr = match[1].trim();

      // Find the actual JSON object - need to properly match braces
      // because the code field contains JS with its own braces
      const startIdx = jsonStr.indexOf('{');
      if (startIdx === -1) continue;

      // Parse character by character to find matching closing brace
      let depth = 0;
      let inString = false;
      let stringChar = '';
      let endIdx = -1;

      for (let i = startIdx; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        const prevChar = i > 0 ? jsonStr[i - 1] : '';

        // Track string state (but not escaped quotes)
        if ((char === '"' || char === "'") && prevChar !== '\\') {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (char === stringChar) {
            inString = false;
          }
        }

        // Only count braces outside of strings
        if (!inString) {
          if (char === '{') depth++;
          else if (char === '}') {
            depth--;
            if (depth === 0) {
              endIdx = i;
              break;
            }
          }
        }
      }

      if (endIdx === -1) continue;

      jsonStr = jsonStr.substring(startIdx, endIdx + 1);

      try {
        const toolCall = JSON.parse(jsonStr);
        if (toolCall.tool && toolCall.code) {
          toolCalls.push(toolCall);
        }
      } catch (e) {
        console.error('Locate: Failed to parse tool call JSON', e, jsonStr.substring(0, 200));
      }
    }

    return toolCalls;
  }

  /**
   * Strip tool call tags from content for display
   * @param {string} content - AI response content
   * @returns {string} Content without tool call tags
   */
  stripToolCalls(content) {
    // Simple regex won't work for nested braces in code, so we need to
    // find and remove each <tool_call>...</tool_call> block properly
    let result = content;
    let startTag = '<tool_call>';
    let endTag = '</tool_call>';

    while (true) {
      const startIdx = result.toLowerCase().indexOf(startTag.toLowerCase());
      if (startIdx === -1) break;

      const endIdx = result.toLowerCase().indexOf(endTag.toLowerCase(), startIdx);
      if (endIdx === -1) {
        // Incomplete tool call tag - remove from start tag to end
        result = result.substring(0, startIdx).trim();
        break;
      }

      // Remove the entire tool_call block
      result = result.substring(0, startIdx) + result.substring(endIdx + endTag.length);
    }

    return result.trim();
  }

  /**
   * Handle tool calls with approval if required
   * @param {Array} toolCalls - Array of tool call objects
   */
  async handleToolCalls(toolCalls) {
    const approvalMode = this.settings?.toolApproval || 'manual';

    // Create a group container for these tool calls
    const toolGroup = this.createToolCallGroup(toolCalls.length);

    for (const toolCall of toolCalls) {
      if (toolCall.tool === 'run_js') {
        if (approvalMode === 'auto') {
          // Execute immediately
          await this.runToolAndContinue(toolCall, null, toolGroup);
        } else {
          // Show approval UI
          await this.showToolApproval(toolCall, toolGroup);
        }
      }
    }
  }

  /**
   * Create a tool call group container using native details/summary
   * @param {number} count - Number of tool calls in this group
   * @returns {HTMLElement} The tool group container
   */
  createToolCallGroup(count) {
    const detailsEl = document.createElement('details');
    detailsEl.className = 'locate-ai-tool-group';

    const summaryEl = document.createElement('summary');
    summaryEl.className = 'locate-ai-tool-group-summary';
    summaryEl.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.854 4.854a.5.5 0 1 0-.708-.708l-3.5 3.5a.5.5 0 0 0 0 .708l3.5 3.5a.5.5 0 0 0 .708-.708L2.707 8l3.147-3.146zm4.292 0a.5.5 0 0 1 .708-.708l3.5 3.5a.5.5 0 0 1 0 .708l-3.5 3.5a.5.5 0 0 1-.708-.708L13.293 8l-3.147-3.146z"/>
      </svg>
      <span class="locate-ai-tool-group-text">Called JS <strong>${count}</strong> time${count !== 1 ? 's' : ''}</span>
    `;

    const content = document.createElement('div');
    content.className = 'locate-ai-tool-group-content';

    detailsEl.appendChild(summaryEl);
    detailsEl.appendChild(content);

    this.messagesContainer.appendChild(detailsEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

    return detailsEl;
  }

  /**
   * Show tool approval UI
   * @param {Object} toolCall - The tool call to approve/reject
   * @param {HTMLElement} toolGroup - The tool group container
   */
  showToolApproval(toolCall, toolGroup) {
    return new Promise((resolve) => {
      const msgEl = document.createElement('div');
      msgEl.className = 'locate-ai-message locate-ai-message-tool-approval';

      // Prettify the code for display
      const displayCode = this.prettifyJS(toolCall.code);

      msgEl.innerHTML = `
        <div class="locate-ai-tool-approval">
          <div class="locate-ai-tool-header">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.854 4.854a.5.5 0 1 0-.708-.708l-3.5 3.5a.5.5 0 0 0 0 .708l3.5 3.5a.5.5 0 0 0 .708-.708L2.707 8l3.147-3.146zm4.292 0a.5.5 0 0 1 .708-.708l3.5 3.5a.5.5 0 0 1 0 .708l-3.5 3.5a.5.5 0 0 1-.708-.708L13.293 8l-3.147-3.146z"/>
            </svg>
            <span>Run JavaScript?</span>
          </div>
          <pre class="locate-ai-tool-code">${this.highlightJS(displayCode)}</pre>
          <div class="locate-ai-tool-actions">
            <button class="locate-ai-btn locate-ai-btn-approve" title="Run code">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.236.236 0 0 1 .02-.022z"/>
              </svg>
              Run
            </button>
            <button class="locate-ai-btn locate-ai-btn-reject" title="Skip code">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
              </svg>
              Skip
            </button>
          </div>
        </div>
      `;

      // Add to tool group content
      const container = toolGroup.querySelector('.locate-ai-tool-group-content');
      container.appendChild(msgEl);
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

      // Handle button clicks
      const approveBtn = msgEl.querySelector('.locate-ai-btn-approve');
      const rejectBtn = msgEl.querySelector('.locate-ai-btn-reject');

      approveBtn.addEventListener('click', async () => {
        // Replace approval UI with executing state
        msgEl.querySelector('.locate-ai-tool-actions').remove();
        msgEl.querySelector('.locate-ai-tool-header span').textContent = 'Running...';

        await this.runToolAndContinue(toolCall, msgEl, toolGroup);
        resolve();
      });

      rejectBtn.addEventListener('click', () => {
        // Replace approval UI with skipped state
        msgEl.querySelector('.locate-ai-tool-actions').remove();
        msgEl.querySelector('.locate-ai-tool-header span').textContent = 'Skipped';
        msgEl.classList.add('locate-ai-tool-skipped');

        // Send skip result back to AI
        this.sendMessage('Tool execution was skipped by the user.', true);
        resolve();
      });
    });
  }

  /**
   * Run a tool and continue the conversation with results
   * @param {Object} toolCall - The tool call to execute
   * @param {HTMLElement} existingEl - Optional existing element to update
   * @param {HTMLElement} toolGroup - The tool group container
   */
  async runToolAndContinue(toolCall, existingEl = null, toolGroup = null) {
    const result = await this.executeJavaScript(toolCall.code);

    if (existingEl) {
      // Update existing element with result
      existingEl.querySelector('.locate-ai-tool-header span').textContent = 'Executed';

      // Add output header
      const outputHeader = document.createElement('div');
      outputHeader.className = 'locate-ai-tool-header locate-ai-tool-header-output';
      outputHeader.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/>
          <path d="M6.854 4.646a.5.5 0 0 1 0 .708L4.207 8l2.647 2.646a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 0 1 .708 0zm2.292 0a.5.5 0 0 0 0 .708L11.793 8l-2.647 2.646a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708 0z"/>
        </svg>
        <span>Output</span>
      `;
      existingEl.querySelector('.locate-ai-tool-approval').appendChild(outputHeader);

      // Add output content
      const outputEl = document.createElement('pre');
      outputEl.className = 'locate-ai-tool-output';
      outputEl.innerHTML = this.highlightResult(result);
      existingEl.querySelector('.locate-ai-tool-approval').appendChild(outputEl);
    } else {
      // Create new result element in the tool group
      this.addToolResult(toolCall.code, result, toolGroup);
    }

    // Send result back to AI
    const resultMessage = `Tool result for \`run_js\`:\n\`\`\`\n${result}\n\`\`\``;
    await this.sendMessage(resultMessage, true);
  }

  /**
   * Execute JavaScript code on the page
   * Uses chrome.scripting.executeScript via background for proper page context
   * @param {string} code - JavaScript code to execute
   * @returns {Promise<string>} Result or error message
   */
  async executeJavaScript(code) {
    try {
      // Send to background script to execute via chrome.scripting API
      const response = await chrome.runtime.sendMessage({
        action: 'executePageScript',
        code: code
      });

      if (response.error) {
        return `Error: ${response.error}`;
      }

      let result = response.result;

      // Truncate very long results
      if (result && result.length > 5000) {
        result = result.substring(0, 5000) + '\n... (truncated)';
      }

      return result || 'undefined';
    } catch (e) {
      return `Error: ${e.message}`;
    }
  }

  /**
   * Add tool execution result to UI
   * @param {string} code - The code that was executed
   * @param {string} result - The execution result
   * @param {HTMLElement} toolGroup - The tool group container
   */
  addToolResult(code, result, toolGroup) {
    const msgEl = document.createElement('div');
    msgEl.className = 'locate-ai-message locate-ai-message-tool';

    // Prettify the code for display
    const displayCode = this.prettifyJS(code);

    msgEl.innerHTML = `
      <div class="locate-ai-tool-result">
        <div class="locate-ai-tool-header">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.854 4.854a.5.5 0 1 0-.708-.708l-3.5 3.5a.5.5 0 0 0 0 .708l3.5 3.5a.5.5 0 0 0 .708-.708L2.707 8l3.147-3.146zm4.292 0a.5.5 0 0 1 .708-.708l3.5 3.5a.5.5 0 0 1 0 .708l-3.5 3.5a.5.5 0 0 1-.708-.708L13.293 8l-3.147-3.146z"/>
          </svg>
          <span>Executed</span>
        </div>
        <pre class="locate-ai-tool-code">${this.highlightJS(displayCode)}</pre>
        <div class="locate-ai-tool-header locate-ai-tool-header-output">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/>
            <path d="M6.854 4.646a.5.5 0 0 1 0 .708L4.207 8l2.647 2.646a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 0 1 .708 0zm2.292 0a.5.5 0 0 0 0 .708L11.793 8l-2.647 2.646a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708 0z"/>
          </svg>
          <span>Output</span>
        </div>
        <pre class="locate-ai-tool-output">${this.highlightResult(result)}</pre>
      </div>
    `;

    // Add to tool group content
    const container = toolGroup.querySelector('.locate-ai-tool-group-content');
    container.appendChild(msgEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Escape HTML special characters
   * @param {string} text
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Simple JavaScript code prettifier
   * Adds line breaks and indentation for better readability
   * @param {string} code - JavaScript code to prettify
   * @returns {string} Prettified code
   */
  prettifyJS(code) {
    // If already has newlines, assume it's formatted
    if (code.includes('\n')) {
      return code.trim();
    }

    let result = '';
    let indent = 0;
    let inString = false;
    let stringChar = '';
    let i = 0;

    while (i < code.length) {
      const char = code[i];
      const nextChar = code[i + 1];

      // Track string state
      if ((char === '"' || char === "'" || char === '`') && (i === 0 || code[i - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      if (inString) {
        result += char;
        i++;
        continue;
      }

      // Handle different characters
      if (char === '{' || char === '[') {
        result += char;
        indent++;
        if (nextChar && nextChar !== '}' && nextChar !== ']') {
          result += '\n' + '  '.repeat(indent);
        }
      } else if (char === '}' || char === ']') {
        indent = Math.max(0, indent - 1);
        if (result.slice(-1) !== '\n' && result.slice(-1) !== '{' && result.slice(-1) !== '[') {
          result += '\n' + '  '.repeat(indent);
        }
        result += char;
      } else if (char === ',') {
        result += char;
        if (nextChar && nextChar !== '\n') {
          result += '\n' + '  '.repeat(indent);
        }
      } else if (char === ';') {
        result += char;
        if (nextChar && nextChar !== '\n' && nextChar !== '}') {
          result += '\n' + '  '.repeat(indent);
        }
      } else if (char === ':' && nextChar === ' ') {
        result += ': ';
        i++; // Skip the space
      } else {
        result += char;
      }

      i++;
    }

    // Clean up extra whitespace
    return result
      .replace(/\n\s*\n/g, '\n')  // Remove empty lines
      .replace(/{\s*}/g, '{}')     // Collapse empty braces
      .replace(/\[\s*\]/g, '[]')   // Collapse empty brackets
      .trim();
  }

  /**
   * Syntax highlight code using Prism.js
   * @param {string} code - Code to highlight
   * @param {string} language - Language for highlighting (default: 'javascript')
   * @returns {string} HTML with syntax highlighting
   */
  highlight(code, language = 'javascript') {
    if (typeof Prism !== 'undefined' && Prism.languages[language]) {
      return Prism.highlight(code, Prism.languages[language], language);
    }
    // Fallback to escaped HTML if Prism not available
    return this.escapeHtml(code);
  }

  /**
   * Syntax highlight JavaScript code
   * @param {string} code - JavaScript code to highlight
   * @returns {string} HTML with syntax highlighting
   */
  highlightJS(code) {
    return this.highlight(code, 'javascript');
  }

  /**
   * Syntax highlight a result/output value (tries JSON first, falls back to JS)
   * @param {string} result - Result string to highlight
   * @returns {string} HTML with syntax highlighting
   */
  highlightResult(result) {
    // Try to detect if it's JSON
    const trimmed = result.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      return this.highlight(result, 'json');
    }
    // Otherwise highlight as JS
    return this.highlight(result, 'javascript');
  }

  /**
   * Add a message to the chat
   * @param {string} role - 'user', 'assistant', or 'error'
   * @param {string} content
   * @param {Array} attachments - Optional array of attachment objects
   */
  addMessage(role, content, attachments = []) {
    // Store in history (except errors)
    if (role !== 'error') {
      this.messages.push({ role, content });
    }

    // Create message element
    const msgEl = document.createElement('div');
    msgEl.className = `locate-ai-message locate-ai-message-${role}`;

    const contentEl = document.createElement('div');
    contentEl.className = 'locate-ai-message-content';

    // Add attachments display if present
    let attachmentsHtml = '';
    if (attachments && attachments.length > 0) {
      attachmentsHtml = '<div class="locate-ai-message-attachments">';
      for (const att of attachments) {
        if (att.isImage) {
          attachmentsHtml += `<img src="${att.dataUrl}" alt="${att.name}" class="locate-ai-message-attachment-image" title="${att.name}">`;
        } else {
          attachmentsHtml += `
            <span class="locate-ai-message-attachment">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
              </svg>
              ${att.name}
            </span>
          `;
        }
      }
      attachmentsHtml += '</div>';
    }

    // Simple markdown-like formatting
    contentEl.innerHTML = attachmentsHtml + this.formatContent(content);

    msgEl.appendChild(contentEl);
    this.messagesContainer.appendChild(msgEl);

    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Format message content with markdown support using marked.js
   * @param {string} content
   * @returns {string}
   */
  formatContent(content) {
    // Escape HTML-like content that's not markdown
    // This prevents the AI from accidentally injecting HTML when it mentions tags like <a> or <div>
    // We preserve markdown code blocks and inline code first
    let processed = content;

    // Temporarily replace code blocks to protect them
    const codeBlocks = [];
    processed = processed.replace(/```[\s\S]*?```/g, (match) => {
      codeBlocks.push(match);
      return `%%CODEBLOCK${codeBlocks.length - 1}%%`;
    });

    // Temporarily replace inline code
    const inlineCodes = [];
    processed = processed.replace(/`[^`]+`/g, (match) => {
      inlineCodes.push(match);
      return `%%INLINECODE${inlineCodes.length - 1}%%`;
    });

    // Escape angle brackets that look like HTML tags (but not markdown)
    // This catches things like <a>, <div>, <script> that the AI might mention
    processed = processed.replace(/<(\/?[a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?>(?![^<]*<\/\1>)/g, (match) => {
      return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    });

    // Restore code blocks and inline code
    codeBlocks.forEach((block, i) => {
      processed = processed.replace(`%%CODEBLOCK${i}%%`, block);
    });
    inlineCodes.forEach((code, i) => {
      processed = processed.replace(`%%INLINECODE${i}%%`, code);
    });

    // Configure marked with custom renderer for code highlighting
    const renderer = new marked.Renderer();

    // Custom code block rendering with Prism highlighting
    renderer.code = ({ text, lang }) => {
      let highlighted = text;
      if (lang && Prism.languages[lang]) {
        try {
          highlighted = Prism.highlight(text, Prism.languages[lang], lang);
        } catch (e) {
          // Fall back to plain text
        }
      } else if (lang === 'js') {
        // Handle 'js' alias for javascript
        try {
          highlighted = Prism.highlight(text, Prism.languages.javascript, 'javascript');
        } catch (e) {}
      }
      return `<pre class="locate-ai-code-block"><code class="language-${lang || 'text'}">${highlighted}</code></pre>`;
    };

    // Custom link rendering to add target="_blank"
    renderer.link = ({ href, title, text }) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    // Configure marked options
    const options = {
      renderer,
      gfm: true,
      breaks: true,
      async: false
    };

    // Parse markdown
    let html = marked.parse(content, options);

    // Auto-link plain URLs that aren't already in anchor tags
    html = this.autoLinkUrls(html);

    return html;
  }

  /**
   * Auto-link plain URLs in HTML content
   * @param {string} html
   * @returns {string}
   */
  autoLinkUrls(html) {
    // Split by HTML tags to avoid modifying URLs inside tags
    const parts = html.split(/(<[^>]+>)/);

    return parts.map((part, index) => {
      // If this part is an HTML tag, don't modify it
      if (part.startsWith('<')) {
        return part;
      }

      // Check if we're inside an anchor tag by looking at previous parts
      let insideAnchor = false;
      for (let i = index - 1; i >= 0; i--) {
        if (parts[i].match(/^<a[\s>]/i)) {
          insideAnchor = true;
          break;
        }
        if (parts[i].match(/^<\/a>/i)) {
          break;
        }
      }

      if (insideAnchor) {
        return part;
      }

      // Replace plain URLs with anchor tags
      return part.replace(/(https?:\/\/[^\s<"')\]]+)/g, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      });
    }).join('');
  }

  /**
   * Add loading indicator
   * @returns {HTMLElement}
   */
  addLoadingIndicator() {
    const loadingEl = document.createElement('div');
    loadingEl.className = 'locate-ai-message locate-ai-message-loading';
    loadingEl.innerHTML = `
      <div class="locate-ai-loading-dots">
        <span></span><span></span><span></span>
      </div>
    `;
    this.messagesContainer.appendChild(loadingEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    return loadingEl;
  }

  /**
   * Set loading state
   * @param {boolean} loading
   */
  setLoading(loading) {
    this.isLoading = loading;
    this.input.disabled = loading;

    // Update send button to show send or stop icon
    if (loading) {
      this.sendBtn.disabled = false;
      this.sendBtn.title = 'Stop generation';
      this.sendBtn.setAttribute('aria-label', 'Stop');
      this.sendBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="3" y="3" width="10" height="10" rx="1"/>
        </svg>
      `;
      this.sendBtn.classList.add('locate-ai-btn-stop');
    } else {
      this.sendBtn.disabled = !this.input.value.trim();
      this.sendBtn.title = 'Send message';
      this.sendBtn.setAttribute('aria-label', 'Send');
      this.sendBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.315.037a.5.5 0 0 1 .54.11zM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493z"/>
        </svg>
      `;
      this.sendBtn.classList.remove('locate-ai-btn-stop');
    }
  }

  /**
   * Stop the current AI generation
   * @param {boolean} showCancelledMessage - Whether to show a cancelled indicator
   */
  stopGeneration(showCancelledMessage = true) {
    const wasLoading = this.isLoading;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Remove loading indicator if present
    const loadingEl = this.messagesContainer.querySelector('.locate-ai-message-loading');
    if (loadingEl) {
      loadingEl.remove();
    }

    // Clean up streaming state
    if (this.streamingElement) {
      // Keep partial content if there is any, just remove streaming class
      if (this.streamingContent.trim()) {
        this.streamingElement.classList.remove('locate-ai-message-streaming');
        // Store partial response in history
        this.messages.push({ role: 'assistant', content: this.streamingContent });
      } else {
        this.streamingElement.remove();
      }
      this.streamingElement = null;
    }
    this.streamingContent = '';

    // Show cancelled message if there was an active operation
    if (wasLoading && showCancelledMessage) {
      this.addCancelledIndicator();
    }

    this.setLoading(false);
  }

  /**
   * Add a cancelled indicator to the chat
   */
  addCancelledIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'locate-ai-cancelled';
    indicator.innerHTML = `
      <span class="locate-ai-cancelled-line"></span>
      <span class="locate-ai-cancelled-text">Cancelled</span>
      <span class="locate-ai-cancelled-line"></span>
    `;
    this.messagesContainer.appendChild(indicator);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Show no API key message
   */
  showNoApiKeyMessage() {
    this.noApiKeyMessage.style.display = 'block';
  }

  /**
   * Clear the conversation
   */
  clearConversation() {
    // Stop any ongoing generation (don't show cancelled since we're clearing anyway)
    this.stopGeneration(false);

    this.messages = [];
    this.conversationId = 'main-' + Date.now(); // New conversation ID
    this.messagesContainer.innerHTML = '';
    this.welcome.style.display = 'block';
    this.messagesContainer.appendChild(this.welcome);
  }

  /**
   * Set context for the conversation
   * @param {Object} context
   */
  setContext(context) {
    this.context = context || {};
  }

  /**
   * Update provider info display and populate model selector
   */
  async updateProviderInfo() {
    await this.loadSettings();

    // Get available providers (those with API keys)
    const availableModels = this.getAvailableModels();

    // Populate the model selector
    this.modelSelect.innerHTML = '';

    if (availableModels.length === 0) {
      // No providers configured
      this.modelSelect.innerHTML = '<option value="">Configure API key in settings</option>';
      this.modelSelect.disabled = true;
      this.noApiKeyMessage.style.display = 'block';
      this.input.disabled = true;
      this.sendBtn.disabled = true;
      return false;
    }

    // Hide the no API key message
    this.noApiKeyMessage.style.display = 'none';
    this.modelSelect.disabled = false;
    this.input.disabled = false;

    // Group models by provider
    const currentProvider = this.settings?.provider || 'openai';
    const currentModel = this.settings?.models?.[currentProvider];

    for (const { provider, providerName, models } of availableModels) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = providerName;

      for (const model of models) {
        const option = document.createElement('option');
        option.value = `${provider}:${model.id}`;
        option.textContent = model.name;
        option.title = model.description || '';

        // Select current model
        if (provider === currentProvider && model.id === currentModel) {
          option.selected = true;
        }

        optgroup.appendChild(option);
      }

      this.modelSelect.appendChild(optgroup);
    }

    // Auto-size the select to fit content
    this.autosizeModelSelect();

    return true;
  }

  /**
   * Auto-size the model selector to fit the selected option text
   */
  autosizeModelSelect() {
    const selectedOption = this.modelSelect.options[this.modelSelect.selectedIndex];
    if (!selectedOption) return;

    // Create a temporary span to measure text width
    const tempSpan = document.createElement('span');
    tempSpan.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: nowrap;
      font-size: 12px;
      font-family: inherit;
    `;
    tempSpan.textContent = selectedOption.textContent;
    document.body.appendChild(tempSpan);

    // Set width: text width + padding for caret (20px) + some buffer (12px)
    const width = tempSpan.offsetWidth + 32;
    this.modelSelect.style.width = `${Math.min(width, 160)}px`;

    document.body.removeChild(tempSpan);
  }

  /**
   * Get list of available models (only for providers with API keys)
   * @returns {Array} Array of {provider, providerName, models}
   */
  getAvailableModels() {
    const apiKeys = this.settings?.apiKeys || {};
    const available = [];

    const providers = {
      openai: { name: 'OpenAI', models: [
        { id: 'gpt-5', name: 'GPT-5', description: 'Most capable model' },
        { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Fast and affordable' },
        { id: 'gpt-4o', name: 'GPT-4o', description: 'Previous generation' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Legacy fast model' }
      ]},
      anthropic: { name: 'Anthropic', models: [
        { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Most capable' },
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Balanced performance' },
        { id: 'claude-haiku-4-20250514', name: 'Claude Haiku 4', description: 'Fastest responses' }
      ]},
      google: { name: 'Google', models: [
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Most capable' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast responses' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2 Flash', description: 'Previous fast model' }
      ]}
    };

    for (const [provider, config] of Object.entries(providers)) {
      if (apiKeys[provider]?.trim()) {
        available.push({
          provider,
          providerName: config.name,
          models: config.models
        });
      }
    }

    return available;
  }

  /**
   * Check if any AI provider is configured
   * @returns {boolean}
   */
  hasAnyProvider() {
    const apiKeys = this.settings?.apiKeys || {};
    return Object.values(apiKeys).some(key => key?.trim());
  }

  /**
   * Handle model selection change
   */
  async handleModelChange() {
    const value = this.modelSelect.value;
    if (!value) return;

    const [provider, modelId] = value.split(':');

    // Update settings
    try {
      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || {};

      settings.ai = settings.ai || {};
      settings.ai.provider = provider;
      settings.ai.models = settings.ai.models || {};
      settings.ai.models[provider] = modelId;

      await chrome.storage.sync.set({ settings });
      this.settings = settings.ai;
    } catch (e) {
      console.error('Locate: Failed to save model selection', e);
    }
  }

  /**
   * Show the panel
   * @param {Object} context - Optional context to set
   * @param {Object} options - Display options
   * @param {boolean} options.sendImmediately - Send the search query as a message immediately
   */
  show(context = null, options = {}) {
    // Reload settings in case they changed
    this.loadSettings();

    if (context) {
      this.setContext(context);

      // If sendImmediately and there's a search query, send it as a message
      if (options.sendImmediately && context.searchQuery) {
        this.updateProviderInfo();
        this.panel.classList.add('visible');
        this.isVisible = true;
        this.sendMessage(context.searchQuery);
        return;
      }

      // Pre-fill input with search query if available
      if (context.searchQuery) {
        this.input.value = context.searchQuery;
        this.handleInputChange();
      }
    }

    this.updateProviderInfo();
    this.panel.classList.add('visible');
    this.isVisible = true;

    // Focus and select input after animation
    setTimeout(() => {
      this.input.focus();
      this.input.select();
    }, 100);
  }

  /**
   * Hide the panel
   */
  hide() {
    // Stop any ongoing generation
    this.stopGeneration();

    this.panel.classList.remove('visible');
    this.isVisible = false;
  }

  /**
   * Toggle panel visibility
   * @param {Object} context - Optional context to set when showing
   */
  toggle(context = null) {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show(context);
    }
  }

  /**
   * Check if panel is visible
   * @returns {boolean}
   */
  isOpen() {
    return this.isVisible;
  }
}

// Export for use in other modules
window.LocateAIPanel = AIPanel;
