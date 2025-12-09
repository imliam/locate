# Locate

A browser extension that replaces the native CMD+F/CTRL+F with an advanced search, bringing, regex, CSS selectors, XPath, text replacements and more powerful features.

![Locate Extension](assets/icons/icon128.png)

## Features

- **Text Search** - Fast, case-sensitive/insensitive search with whole word matching
   **Regex Search** - Full regex support with `/pattern/flags` syntax
- **CSS Selector Search** - Find elements by CSS selector
- **XPath Search** - Find elements using XPath expressions with `//` prefix
- **Search & Replace** - Replace the found text, one-by-one or in bulk, either in editable inputs or across the entire page
- **AI Assistant** - Ask AI about the page, or even get it to modify the page! Ask it what the site would look like with Comic Sans, or to summarise the content.
- **Customizable** - Custom keybinds, highlight colors, themes

## Development Setup

### Prerequisites

- Google Chrome or Chromium-based browser

### Loading the Extension (Development)

1. Clone or download this repository:
   ```bash
   git clone http://github.com/imliam/locate.git
   cd locate
   ```

2. Open Chrome and navigate to:
   ```
   chrome://extensions/
   ```

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the `locate` folder

5. The extension is now installed! Press `Cmd+F` (Mac) or `Ctrl+F` (Windows/Linux) on any webpage to open the search overlay.

### Making Changes

1. Edit files in the `src/` directory
2. Go to `chrome://extensions/`
3. Click the **refresh icon** on the Locate extension card
4. Refresh any open tabs to see content script changes

## Packaging for Distribution

### Create a ZIP for Chrome Web Store

1. Ensure all files are saved and the extension works correctly

2. Create a production ZIP:
   ```bash
   # From the locate directory
   zip -r locate-extension.zip . \
     -x "*.git*" \
     -x "*.DS_Store" \
     -x "*.md" \
     -x "*.zip"
   ```

3. The ZIP should contain:
   ```
   locate-extension.zip
   ├── manifest.json
   ├── assets/
   ├── src/
   └── (other necessary files)
   ```

4. Publish it on the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)

### Local Distribution (CRX)

For distributing outside the Web Store:

1. Go to `chrome://extensions/`
2. Click **Pack extension**
3. Select the `locate` directory
4. Chrome will create `locate.crx` and `locate.pem` (keep the .pem private!)

> **Note**: CRX files require enterprise policy installation on Chrome. For regular users, use the Web Store or load unpacked

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - See LICENSE file for details.
