/**
 * Locate - Background Service Worker
 * Handles extension commands, cross-tab communication, and AI API requests
 */

// Import AI providers (ES module style since service worker is type: module)
// Note: We'll need to define the AI classes inline since Chrome extension
// service workers can't import from content scripts

// ===== AI PROVIDERS INLINE =====

/**
 * Available AI providers and their configurations
 */
const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable model' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous generation' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Legacy model' }
    ],
    defaultModel: 'gpt-4o-mini'
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Latest balanced model' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Fast and intelligent' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fastest responses' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most capable' }
    ],
    defaultModel: 'claude-3-5-sonnet-20241022'
  },
  google: {
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Most capable' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast responses' },
      { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro', description: 'Previous generation' }
    ],
    defaultModel: 'gemini-1.5-flash'
  }
};

const DEFAULT_AI_SETTINGS = {
  provider: 'openai',
  apiKeys: { openai: '', anthropic: '', google: '' },
  models: {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-sonnet-20241022',
    google: 'gemini-1.5-flash'
  },
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: `You are "Locate AI", a helpful assistant integrated into the browser to help users interact with web pages.
- Understand and analyze page content
- Find specific information on the current page
- Explain selected text or elements
- Answer questions about the page

You can use markdown in your responses for formatting: **bold**, *italic*, \`code\`, code blocks, lists, headers, blockquotes, and [links](url).

## Tools

You have access to a tool that lets you run JavaScript on the current page. To use it, include a tool call in your response using this exact format:

<tool_call>
{"tool": "run_js", "code": "your JavaScript code here"}
</tool_call>

The code runs in the page context and can access the DOM. Return a value and it will be sent back to you. Examples:

<tool_call>
{"tool": "run_js", "code": "document.querySelectorAll('h1, h2, h3').length"}
</tool_call>

<tool_call>
{"tool": "run_js", "code": "Array.from(document.querySelectorAll('a')).slice(0, 10).map(a => ({text: a.textContent.trim(), href: a.href}))"}
</tool_call>

<tool_call>
{"tool": "run_js", "code": "document.body.innerText.length"}
</tool_call>

After a tool call, wait for the result before continuing. You'll receive the output and can make additional tool calls or provide your final answer. Keep code simple and focused. For complex tasks, break them into multiple calls.

Do not make assumptions about the markup of the page - you can make multiple tool calls to gather information about the structure of the page if needed.

Be concise and helpful, we are assisting users in navigating and understanding web content effectively and do not need superfluous information or affirmations.`
};

/**
 * OpenAI Provider
 */
class OpenAIProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = AI_PROVIDERS.openai.baseUrl;
  }

  async chatStream(messages, options = {}, onChunk = () => {}) {
    const model = options.model || AI_PROVIDERS.openai.defaultModel;

    // GPT-5 models don't support custom temperature
    const isGpt5 = model.startsWith('gpt-5');
    const body = {
      model,
      messages,
      max_completion_tokens: options.maxTokens ?? 2048,
      stream: true
    };
    if (!isGpt5) {
      body.temperature = options.temperature ?? 0.7;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            onChunk(content);
          }
        } catch (e) {
          // Skip malformed JSON
        }
      }
    }

    return fullResponse;
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return { success: false, error: error.error?.message || `HTTP ${response.status}` };
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

/**
 * Anthropic Provider
 */
class AnthropicProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = AI_PROVIDERS.anthropic.baseUrl;
  }

  async chatStream(messages, options = {}, onChunk = () => {}) {
    const model = options.model || AI_PROVIDERS.anthropic.defaultModel;

    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const chatMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        system: systemMessage,
        messages: chatMessages,
        max_tokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7,
        stream: true
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'content_block_delta' && data.delta?.text) {
            fullResponse += data.delta.text;
            onChunk(data.delta.text);
          }
        } catch (e) {
          // Skip malformed JSON
        }
      }
    }

    return fullResponse;
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return { success: false, error: error.error?.message || `HTTP ${response.status}` };
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

/**
 * Google Gemini Provider
 */
class GoogleProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = AI_PROVIDERS.google.baseUrl;
  }

  async chatStream(messages, options = {}, onChunk = () => {}) {
    const model = options.model || AI_PROVIDERS.google.defaultModel;

    const contents = this.convertMessages(messages);
    const systemInstruction = messages.find(m => m.role === 'system')?.content;

    const response = await fetch(
      `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 2048
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Google API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            fullResponse += text;
            onChunk(text);
          }
        } catch (e) {
          // Skip malformed JSON
        }
      }
    }

    return fullResponse;
  }

  convertMessages(messages) {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
  }

  async testConnection() {
    try {
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return { success: false, error: error.error?.message || `HTTP ${response.status}` };
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

/**
 * AI Provider Manager for service worker
 */
class AIProviderManager {
  constructor() {
    this.conversations = new Map();
  }

  getProvider(providerName, apiKey) {
    switch (providerName) {
      case 'openai':
        return new OpenAIProvider(apiKey);
      case 'anthropic':
        return new AnthropicProvider(apiKey);
      case 'google':
        return new GoogleProvider(apiKey);
      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  async getAISettings() {
    try {
      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || {};
      return {
        ...DEFAULT_AI_SETTINGS,
        ...settings.ai,
        apiKeys: {
          ...DEFAULT_AI_SETTINGS.apiKeys,
          ...settings.ai?.apiKeys
        },
        models: {
          ...DEFAULT_AI_SETTINGS.models,
          ...settings.ai?.models
        }
      };
    } catch (e) {
      return { ...DEFAULT_AI_SETTINGS };
    }
  }

  async sendMessage(conversationId, userMessage, context = {}, attachments = [], onChunk = () => {}) {
    const settings = await this.getAISettings();
    const provider = settings.provider;
    const apiKey = settings.apiKeys[provider];

    if (!apiKey) {
      throw new Error(`No API key configured for ${AI_PROVIDERS[provider]?.name || provider}. Please add your API key in the extension options.`);
    }

    const providerInstance = this.getProvider(provider, apiKey);

    // Get or create conversation
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, []);
    }
    const messages = this.conversations.get(conversationId);

    // Build system prompt with context
    let systemPrompt = settings.systemPrompt;
    if (context.pageTitle) {
      systemPrompt += `\n\nCurrent page: ${context.pageTitle}`;
    }
    if (context.pageUrl) {
      systemPrompt += `\nURL: ${context.pageUrl}`;
    }
    if (context.searchQuery) {
      systemPrompt += `\n\nUser's current search query: "${context.searchQuery}"`;
    }

    // Build user message content (may be multi-part with attachments)
    const userContent = this.buildUserContent(provider, userMessage, attachments);

    // Add user message to history
    messages.push({ role: 'user', content: userContent });

    // Prepare messages for API
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // Get model settings
    const modelOptions = {
      model: settings.models[provider],
      temperature: settings.temperature,
      maxTokens: settings.maxTokens
    };

    try {
      const response = await providerInstance.chatStream(apiMessages, modelOptions, onChunk);
      messages.push({ role: 'assistant', content: response });

      // Keep conversation history manageable
      while (messages.length > 20) {
        messages.shift();
      }

      return response;
    } catch (error) {
      messages.pop(); // Remove failed user message
      throw error;
    }
  }

  /**
   * Build user content with attachments formatted for the specific provider
   */
  buildUserContent(provider, message, attachments) {
    if (!attachments || attachments.length === 0) {
      return message;
    }

    // Different providers have different formats for multi-modal content
    switch (provider) {
      case 'openai':
        return this.buildOpenAIContent(message, attachments);
      case 'anthropic':
        return this.buildAnthropicContent(message, attachments);
      case 'google':
        return this.buildGoogleContent(message, attachments);
      default:
        // Fallback: include text file contents as text, skip images
        return this.buildTextOnlyContent(message, attachments);
    }
  }

  /**
   * Build content for OpenAI (GPT-4o vision format)
   */
  buildOpenAIContent(message, attachments) {
    const content = [];

    // Add images first
    for (const att of attachments) {
      if (att.isImage && att.dataUrl) {
        content.push({
          type: 'image_url',
          image_url: {
            url: att.dataUrl,
            detail: 'auto'
          }
        });
      }
    }

    // Add text files as part of the message
    let textContent = message;
    for (const att of attachments) {
      if (!att.isImage && att.content) {
        textContent += `\n\n--- File: ${att.name} ---\n${att.content}`;
      }
    }

    content.push({
      type: 'text',
      text: textContent
    });

    return content;
  }

  /**
   * Build content for Anthropic Claude (vision format)
   */
  buildAnthropicContent(message, attachments) {
    const content = [];

    // Add images first
    for (const att of attachments) {
      if (att.isImage && att.dataUrl) {
        // Extract base64 data and media type from data URL
        const matches = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: matches[1],
              data: matches[2]
            }
          });
        }
      }
    }

    // Add text files as part of the message
    let textContent = message;
    for (const att of attachments) {
      if (!att.isImage && att.content) {
        textContent += `\n\n--- File: ${att.name} ---\n${att.content}`;
      }
    }

    content.push({
      type: 'text',
      text: textContent
    });

    return content;
  }

  /**
   * Build content for Google Gemini
   */
  buildGoogleContent(message, attachments) {
    // Google uses a different format, build parts array
    const parts = [];

    // Add images
    for (const att of attachments) {
      if (att.isImage && att.dataUrl) {
        const matches = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          parts.push({
            inlineData: {
              mimeType: matches[1],
              data: matches[2]
            }
          });
        }
      }
    }

    // Add text content
    let textContent = message;
    for (const att of attachments) {
      if (!att.isImage && att.content) {
        textContent += `\n\n--- File: ${att.name} ---\n${att.content}`;
      }
    }

    parts.push({ text: textContent });

    return parts;
  }

  /**
   * Build text-only content (fallback for providers without vision support)
   */
  buildTextOnlyContent(message, attachments) {
    let textContent = message;

    for (const att of attachments) {
      if (att.isImage) {
        textContent += `\n\n[Image attached: ${att.name}]`;
      } else if (att.content) {
        textContent += `\n\n--- File: ${att.name} ---\n${att.content}`;
      }
    }

    return textContent;
  }

  async testConnection(providerName, apiKey) {
    try {
      const provider = this.getProvider(providerName, apiKey);
      return await provider.testConnection();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  clearConversation(conversationId) {
    this.conversations.delete(conversationId);
  }
}

// ===== END AI PROVIDERS =====

// AI Provider Manager instance
let aiManager = null;

function getAIManager() {
  if (!aiManager) {
    aiManager = new AIProviderManager();
  }
  return aiManager;
}

// Handle extension action click (toolbar icon)
chrome.action.onClicked.addListener(async (tab) => {
  await toggleOverlay(tab.id);
});

// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === '_execute_action') {
    await toggleOverlay(tab.id);
  }
});

/**
 * Toggle the search overlay in a tab
 * @param {number} tabId - The tab ID
 */
async function toggleOverlay(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'toggle' });
  } catch (error) {
    // Content script might not be loaded, inject it
    console.log('Locate: Injecting content scripts into tab', tabId);
    await injectContentScripts(tabId);

    // Try again after injection
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'toggle' });
      } catch (e) {
        console.error('Locate: Failed to communicate with content script', e);
      }
    }, 100);
  }
}

/**
 * Inject content scripts into a tab
 * @param {number} tabId - The tab ID
 */
async function injectContentScripts(tabId) {
  try {
    // Inject CSS first
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['src/content/styles.css']
    });

    // Then inject JS files in order
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'src/shared/storage.js',
        'src/content/search-engine.js',
        'src/content/highlighter.js',
        'src/content/replacer.js',
        'src/content/ai-panel.js',
        'src/content/overlay.js',
        'src/content/main.js'
      ]
    });
  } catch (error) {
    console.error('Locate: Failed to inject content scripts', error);
  }
}

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Locate: Extension installed');
    // Default settings are now handled by the storage module
  } else if (details.reason === 'update') {
    console.log('Locate: Extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Handle messages from content scripts or other parts of the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getSettings':
      chrome.storage.sync.get('settings', (result) => {
        sendResponse({ success: true, settings: result.settings || {} });
      });
      return true; // Keep channel open for async response

    case 'saveSettings':
      chrome.storage.sync.set({ settings: message.settings }, () => {
        sendResponse({ success: true });
      });
      return true;

    case 'openOptions':
      chrome.runtime.openOptionsPage();
      sendResponse({ success: true });
      return true;

    case 'executePageScript':
      handleExecutePageScript(message, sender, sendResponse);
      return true;

    case 'testAIConnection':
      handleTestAIConnection(message, sendResponse);
      return true;

    case 'sendAIMessage':
      handleSendAIMessage(message, sender, sendResponse);
      return true;

    case 'clearConversation':
      handleClearConversation(message, sendResponse);
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

/**
 * Execute JavaScript in the page context using chrome.scripting API
 */
async function handleExecutePageScript(message, sender, sendResponse) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ error: 'No tab ID available' });
      return;
    }

    const code = message.code;

    // Execute in the MAIN world (page context) to access page variables
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (codeToRun) => {
        try {
          // Strip trailing semicolons which would break the return statement
          const cleanCode = codeToRun.trim().replace(/;+\s*$/, '');
          // Use Function constructor instead of eval for slightly better safety
          const fn = new Function(`return (${cleanCode})`);
          const result = fn();
          return JSON.stringify(result, null, 2);
        } catch (e) {
          return 'Error: ' + e.message;
        }
      },
      args: [code]
    });

    const result = results?.[0]?.result;
    sendResponse({ result: result ?? 'undefined' });
  } catch (e) {
    console.error('Locate: Script execution failed', e);
    sendResponse({ error: e.message });
  }
}

/**
 * Handle AI connection test
 */
async function handleTestAIConnection(message, sendResponse) {
  try {
    const manager = getAIManager();
    const result = await manager.testConnection(message.provider, message.apiKey);
    sendResponse(result);
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

/**
 * Handle sending AI message with streaming
 */
async function handleSendAIMessage(message, sender, sendResponse) {
  try {
    const manager = getAIManager();
    const tabId = sender.tab?.id;

    // Stream chunks back to the content script
    const onChunk = (chunk) => {
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: 'aiStreamChunk',
          chunk
        }).catch(() => {
          // Tab might be closed
        });
      }
    };

    const response = await manager.sendMessage(
      message.conversationId,
      message.message,
      message.context || {},
      message.attachments || [],
      onChunk
    );

    // Send completion signal
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        action: 'aiStreamEnd'
      }).catch(() => {});
    }

    sendResponse({ success: true, content: response });
  } catch (e) {
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        action: 'aiError',
        error: e.message
      }).catch(() => {});
    }

    sendResponse({ success: false, error: e.message });
  }
}

/**
 * Handle clearing conversation history
 */
function handleClearConversation(message, sendResponse) {
  try {
    const manager = getAIManager();
    manager.clearConversation(message.conversationId);
    sendResponse({ success: true });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

console.log('Locate: Service worker initialised');
