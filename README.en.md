# AI Tags Generator

[English](README.en.md) | [简体中文](README.md)

A powerful Obsidian plugin that uses AI technology to intelligently generate tags for your notes, helping you better organize and manage your knowledge base.

![](https://github.com/user-attachments/assets/cd11f758-8846-440d-8ff7-dba637cbcaf9)

## ✨ Key Features

- 🤖 Support for Multiple AI Service Providers
  - OpenAI (GPT-4o-mini, GPT-4o, GPT-3.5-turbo)
  - Gemini (Gemini-1.5-flash, Gemini-2.0-flash)
  - DeepSeek (deepseek-chat, deepseek-reasoner)
  - DeepSeek - Volcano Engine
  - Claude (in testing)

- 🔧 Flexible Configuration Options
  - Custom API endpoint support
  - Customizable model selection
  - Custom prompt template support
  - Compatible with OneAPI and other proxy services

- 🎯 Intelligent Tag Generation
  - AI-powered tag recommendations based on document content
  - Manual editing and filtering of suggested tags
  - Automatic frontmatter updates

## 🚀 Installation

### Method 1: Install from Plugin Store (Recommended)

1. Open Obsidian Settings
2. Go to Community Plugins
3. Search for "AI Tags Generator"
4. Click Install
5. Enable the plugin

> Note: The plugin has been submitted to the official store and is awaiting approval.

### Method 2: Manual Installation

1. Download the following files from the [GitHub Releases](https://github.com/dlzmoe/obsidian-ai-tags/releases) page:
   - main.js
   - manifest.json
   - styles.css
2. Create an `obsidian-ai-tags` folder in your Obsidian vault's `.obsidian/plugins/` directory
3. Place the downloaded files into the `obsidian-ai-tags` folder
4. Restart Obsidian
5. Enable AI Tags Generator in Settings > Community Plugins

## ⚙️ Configuration

1. Find "AI Tags Generator" in the Obsidian settings panel
2. Choose your preferred AI service provider
3. Configure the service provider settings:
   - API key
   - API endpoint (optional, defaults to official endpoint)
   - Select the model to use
   - Custom prompt template (optional, for customizing tag generation style and rules)

### API Configuration Examples

**OpenAI Configuration**
- API Endpoint: https://api.openai.com/v1/chat/completions
- Recommended Model: gpt-4o-mini

**Gemini Configuration**
- API Endpoint: https://generativelanguage.googleapis.com/v1beta/models/
- Recommended Model: gemini-1.5-flash

## 📝 How to Use

1. Open any Markdown document
2. Click the tag icon button in the left sidebar
3. The plugin will automatically analyze the document content and generate recommended tags
4. In the tag selection popup, you can:
   - Check/uncheck recommended tags
   - Edit tag content
   - Click confirm to add selected tags to the document

## 🖼️ Feature Showcase

![](https://github.com/user-attachments/assets/571891dd-04cc-44f5-9168-3411133033ab)
![](https://github.com/user-attachments/assets/cd11f758-8846-440d-8ff7-dba637cbcaf9)
![](https://github.com/user-attachments/assets/0bb82f73-b3ab-49c9-b94f-558d6009477c)

## ❓ FAQ

**Q: Why did tag generation fail?**  
A: Please check:
1. If the API key is correctly configured
2. If the network connection is working
3. If you have sufficient API credits

**Q: How to use third-party API proxies?**  
A: Simply modify the API endpoint in settings to your proxy service address. The format should match the original API format.

## 📄 License

This project is open-source under the MIT License. Contributions and suggestions are welcome.

## 🙏 Acknowledgments

Thanks to all users who have provided feedback and suggestions for this project.