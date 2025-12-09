/**
 * Locate - AI Provider Abstraction
 * Unified interface for OpenAI, Anthropic, and Google AI providers
 * All API calls are made via direct fetch (no SDK dependencies)
 */

/**
 * Available AI providers and their configurations
 */
const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5', name: 'GPT-5', description: 'Most capable model' },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Fast and affordable' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Previous generation' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Legacy fast model' }
    ],
    defaultModel: 'gpt-5-mini'
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4.5', description: 'Most capable' },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4.5', description: 'Balanced performance' },
      { id: 'claude-haiku-4-20250514', name: 'Claude Haiku 4.5', description: 'Fastest responses' },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Previous Sonnet' }
    ],
    defaultModel: 'claude-sonnet-4-20250514'
  },
  google: {
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-3-pro', name: 'Gemini 3 Pro', description: 'Most capable' },
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash', description: 'Fast responses' },
      { id: 'gemini-2-pro', name: 'Gemini 2 Pro', description: 'Previous generation' },
      { id: 'gemini-2-flash', name: 'Gemini 2 Flash', description: 'Previous fast model' }
    ],
    defaultModel: 'gemini-3-flash'
  }
};

/**
 * Default AI settings
 */
const DEFAULT_AI_SETTINGS = {
  provider: 'openai',
  apiKeys: {
    openai: '',
    anthropic: '',
    google: ''
  },
  models: {
    openai: 'gpt-5-mini',
    anthropic: 'claude-sonnet-4-20250514',
    google: 'gemini-3-flash'
  },
  temperature: 0.7,
  maxTokens: 2048,
  suggestions: [
    { title: 'Count links', prompt: 'How many links are on this page?' },
    { title: 'Find headings', prompt: 'List all the headings of the page in a tree' },
    { title: 'Summarise page', prompt: 'Summarise the main content of this page' },
    { title: 'Turn into Tweet', prompt: 'Turn the contents of this page into someething that can be shared as a catchy Tweet' }
  ],
  systemPrompt: `You are "Locate AI", a helpful assistant integrated into the browser to help users interact with web pages.
- Understand and analyze page content
- Find specific information on the current page
- Explain selected text or elements
- Answer questions about the page

You can use markdown in your responses for formatting: **bold**, *italic*, \`code\`, code blocks, lists, headers, blockquotes, and [links](url).

Do not make assumptions about the markup of the page - you can make multiple tool calls to gather information about the structure of the page if needed.

Be concise and helpful, we are assisting users in navigating and understanding web content effectively and do not need superfluous information or affirmations.`,
};

/**
 * Base class for AI providers
 */
class AIProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Send a chat message and get a response
   * @param {Array} messages - Array of {role, content} messages
   * @param {Object} options - Model options (model, temperature, maxTokens)
   * @returns {Promise<string>} - The assistant's response
   */
  async chat(messages, options = {}) {
    throw new Error('chat() must be implemented by subclass');
  }

  /**
   * Send a chat message and stream the response
   * @param {Array} messages - Array of {role, content} messages
   * @param {Object} options - Model options
   * @param {Function} onChunk - Callback for each chunk of text
   * @returns {Promise<string>} - The complete response
   */
  async chatStream(messages, options = {}, onChunk = () => {}) {
    throw new Error('chatStream() must be implemented by subclass');
  }

  /**
   * Test the connection with the API
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by subclass');
  }
}

/**
 * OpenAI Provider
 */
class OpenAIProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey);
    this.baseUrl = AI_PROVIDERS.openai.baseUrl;
  }

  async chat(messages, options = {}) {
    const model = options.model || AI_PROVIDERS.openai.defaultModel;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  async chatStream(messages, options = {}, onChunk = () => {}) {
    const model = options.model || AI_PROVIDERS.openai.defaultModel;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        stream: true
      })
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
class AnthropicProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey);
    this.baseUrl = AI_PROVIDERS.anthropic.baseUrl;
  }

  async chat(messages, options = {}) {
    const model = options.model || AI_PROVIDERS.anthropic.defaultModel;

    // Anthropic uses a different message format - extract system message
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const chatMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        system: systemMessage,
        messages: chatMessages,
        max_tokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0]?.text || '';
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
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
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
      // Anthropic doesn't have a simple models endpoint, so we make a minimal request
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
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
class GoogleProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey);
    this.baseUrl = AI_PROVIDERS.google.baseUrl;
  }

  async chat(messages, options = {}) {
    const model = options.model || AI_PROVIDERS.google.defaultModel;

    // Convert messages to Gemini format
    const contents = this.convertMessages(messages);
    const systemInstruction = messages.find(m => m.role === 'system')?.content;

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
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

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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

  /**
   * Convert standard messages format to Gemini format
   */
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
 * AI Provider Manager
 * Handles provider selection, API key management, and conversation history
 */
class AIProviderManager {
  constructor() {
    this.storage = typeof window !== 'undefined' && window.LocateStorage
      ? new window.LocateStorage()
      : null;
    this.conversations = new Map(); // tabId -> messages[]
  }

  /**
   * Get the current provider instance
   * @returns {Promise<AIProvider>}
   */
  async getProvider() {
    const settings = await this.getAISettings();
    const provider = settings.provider;
    const apiKey = settings.apiKeys[provider];

    if (!apiKey) {
      throw new Error(`No API key configured for ${AI_PROVIDERS[provider]?.name || provider}`);
    }

    switch (provider) {
      case 'openai':
        return new OpenAIProvider(apiKey);
      case 'anthropic':
        return new AnthropicProvider(apiKey);
      case 'google':
        return new GoogleProvider(apiKey);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Get a specific provider by name
   * @param {string} providerName
   * @param {string} apiKey
   * @returns {AIProvider}
   */
  getProviderByName(providerName, apiKey) {
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

  /**
   * Get AI settings from storage
   * @returns {Promise<Object>}
   */
  async getAISettings() {
    if (!this.storage) {
      return { ...DEFAULT_AI_SETTINGS };
    }

    try {
      const settings = await this.storage.getSettings();
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

  /**
   * Save AI settings to storage
   * @param {Object} aiSettings
   */
  async saveAISettings(aiSettings) {
    if (!this.storage) return;
    await this.storage.set('ai', aiSettings);
  }

  /**
   * Send a message in a conversation
   * @param {string} conversationId - Unique conversation ID (e.g., tabId)
   * @param {string} userMessage - The user's message
   * @param {Object} context - Optional context (pageContent, etc.)
   * @param {Function} onChunk - Callback for streaming chunks
   * @returns {Promise<string>} - The assistant's response
   */
  async sendMessage(conversationId, userMessage, context = {}, onChunk = () => {}) {
    const settings = await this.getAISettings();
    const provider = await this.getProvider();

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

    // Add user message to history
    messages.push({ role: 'user', content: userMessage });

    // Prepare messages for API
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // Get model settings
    const modelOptions = {
      model: settings.models[settings.provider],
      temperature: settings.temperature,
      maxTokens: settings.maxTokens
    };

    try {
      // Stream the response
      const response = await provider.chatStream(apiMessages, modelOptions, onChunk);

      // Add assistant response to history
      messages.push({ role: 'assistant', content: response });

      // Keep conversation history manageable (last 20 messages)
      while (messages.length > 20) {
        messages.shift();
      }

      return response;
    } catch (error) {
      // Remove the user message if request failed
      messages.pop();
      throw error;
    }
  }

  /**
   * Clear conversation history
   * @param {string} conversationId
   */
  clearConversation(conversationId) {
    this.conversations.delete(conversationId);
  }

  /**
   * Get conversation history
   * @param {string} conversationId
   * @returns {Array}
   */
  getConversation(conversationId) {
    return this.conversations.get(conversationId) || [];
  }

  /**
   * Test connection for a specific provider
   * @param {string} providerName
   * @param {string} apiKey
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testConnection(providerName, apiKey) {
    try {
      const provider = this.getProviderByName(providerName, apiKey);
      return await provider.testConnection();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get available providers and their models
   * @returns {Object}
   */
  getProviders() {
    return AI_PROVIDERS;
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.LocateAIProviders = AI_PROVIDERS;
  window.LocateAIProviderManager = AIProviderManager;
  window.LocateDefaultAISettings = DEFAULT_AI_SETTINGS;
}

// Export for service worker
if (typeof self !== 'undefined' && typeof self.importScripts === 'function') {
  self.LocateAIProviders = AI_PROVIDERS;
  self.LocateAIProviderManager = AIProviderManager;
  self.LocateDefaultAISettings = DEFAULT_AI_SETTINGS;
}
