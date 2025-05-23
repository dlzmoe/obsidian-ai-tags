# AI Tags Generator

[English](README.en.md) | 简体中文

一个强大的 Obsidian 插件，使用 AI 技术为笔记文件智能生成标签，帮助你更好地组织和管理知识库。

![](https://github.com/user-attachments/assets/cd11f758-8846-440d-8ff7-dba637cbcaf9)

## ✨ 主要特性

- 🤖 支持多个主流 AI 服务商
  - OpenAI (GPT-4o-mini, GPT-4o, GPT-3.5-turbo)
  - Gemini (Gemini-1.5-flash, Gemini-2.0-flash)
  - DeepSeek - 深度求索 (deepseek-chat, deepseek-reasoner)
  - DeepSeek - 火山引擎
  - Claude (测试中)

- 🔧 灵活的配置选项
  - 支持自定义 API 接口地址
  - 支持自定义模型选择
  - 支持自定义提示词模板
  - 兼容 OneAPI 等中转服务

- 🎯 智能标签生成
  - 基于文档内容智能推荐标签
  - 支持手动编辑和筛选推荐标签
  - 自动更新文档的 frontmatter

## 🚀 安装方法

> 注：该项目暂未上架 Obsidian 插件商店

1. 从 [GitHub Releases](https://github.com/dlzmoe/obsidian-ai-tags/releases) 页面下载最新版本的以下文件：
   - main.js
   - manifest.json
   - styles.css
2. 在你的 Obsidian 库的 `.obsidian/plugins/` 目录下创建 `obsidian-ai-tags` 文件夹
3. 将下载的文件放入 `obsidian-ai-tags` 文件夹中
4. 重启 Obsidian
5. 在设置 > 第三方插件中启用 AI Tags Generator

**或者使用 [BRAT 插件](https://github.com/TfTHacker/obsidian42-brat) 安装：**
1. 安装 BRAT 插件
2. 在 BRAT 设置中添加本插件仓库路径：`dlzmoe/obsidian-ai-tags`
3. 启用 AI Tags Generator 插件

## ⚙️ 配置说明

1. 在 Obsidian 设置面板中找到 "AI Tags Generator" 设置项
2. 选择你想使用的 AI 服务商
3. 配置对应服务商的设置：
   - API 密钥
   - API 接口地址（可选，默认使用官方接口）
   - 选择要使用的模型
   - 自定义提示词模板（可选，用于定制标签生成的风格和规则）

### API 配置示例

**OpenAI 配置**
- API 地址：https://api.openai.com/v1/chat/completions
- 推荐模型：gpt-4o-mini

**Gemini 配置**
- API 地址：https://generativelanguage.googleapis.com/v1beta/models/
- 推荐模型：gemini-1.5-flash

## 📝 使用方法

1. 打开任意 Markdown 文档
2. 点击左侧边栏的标签图标按钮
3. 插件会自动分析文档内容并生成推荐标签
4. 在弹出的标签选择框中，你可以：
   - 勾选/取消勾选推荐的标签
   - 编辑标签内容
   - 点击确认将选中的标签添加到文档中

## 🖼️ 功能展示

![image](https://github.com/user-attachments/assets/f2e1da14-0ce3-4a6f-8b28-95c854ba175c)

![](https://github.com/user-attachments/assets/cd11f758-8846-440d-8ff7-dba637cbcaf9)
![](https://github.com/user-attachments/assets/0bb82f73-b3ab-49c9-b94f-558d6009477c)

## ❓ 常见问题

**Q: 为什么标签生成失败？**  
A: 请检查：
1. API 密钥是否正确配置
2. 网络连接是否正常
3. API 余额是否充足

**Q: 如何使用第三方 API 代理？**  
A: 在设置中修改 API 地址为你的代理服务地址即可，格式需与原始 API 格式保持一致。

## 📄 开源协议

本项目采用 MIT 协议开源，欢迎贡献代码或提出建议。

## 🙏 鸣谢

感谢所有为本项目提供反馈和建议的用户。
