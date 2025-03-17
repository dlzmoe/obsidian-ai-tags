import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, Modal, MarkdownView, DropdownComponent } from 'obsidian';

import { AIService, AIServiceConfig } from './src/services/AIService';

interface ProviderSettings {
	apiKey: string;
	apiUrl: string;
	model: string;
}

interface AutoTaggerSettings {
	provider: string;
	providerSettings: Record<string, ProviderSettings>;
}

const DEFAULT_SETTINGS: AutoTaggerSettings = {
	provider: 'openai',
	providerSettings: {
		openai: {
			apiKey: '',
			apiUrl: 'https://api.openai.com/v1/chat/completions',
			model: 'gpt-4o-mini'
		},
		gemini: {
			apiKey: '',
			apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/',
			model: 'gemini-1.5-flash'
		},
		claude: {
			apiKey: '',
			apiUrl: 'https://api.anthropic.com/v1/messages',
			model: 'claude-3-5-sonnet'
		},
		deepseek: {
			apiKey: '',
			apiUrl: 'https://api.deepseek.com/v1/chat/completions',
			model: 'deepseek-chat'
		},
		volcano: {
			apiKey: '',
			apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
			model: ''
		}
	}
}

const PROVIDER_CONFIGS = {
	openai: {
		defaultUrl: 'https://api.openai.com/v1/chat/completions',
		defaultModel: 'gpt-4o-mini',
		models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo']
	},
	gemini: {
		defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/models/',
		defaultModel: 'gemini-1.5-flash',
		models: ['gemini-1.5-flash', 'gemini-2.0-flash']
	},
	claude: {
		defaultUrl: 'https://api.anthropic.com/v1/messages',
		defaultModel: 'claude-3-5-sonnet',
		models: ['claude-3-5-sonnet', 'claude-3-7-sonnet', 'claude-3-opus', 'claude-3-haiku']
	},
	deepseek: {
		defaultUrl: 'https://api.deepseek.com/v1/chat/completions',
		defaultModel: 'deepseek-chat',
		models: ['deepseek-chat', 'deepseek-coder']
	},
	volcano: {
		defaultUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
		defaultModel: '',
		models: ['']
	}
};

export default class AutoTaggerPlugin extends Plugin {
	settings: AutoTaggerSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('tag', '生成标签', async () => {
			await this.generateTags();
		});

		this.addSettingTab(new AutoTaggerSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async generateTags() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			new Notice('请打开一个文档以生成标签');
			return;
		}

		const file = activeView.file;
		const content = await this.app.vault.read(file);

		const loadingNotice = new Notice('正在生成标签...', 0);

		try {
			const tags = await this.analyzeTags(content);
			loadingNotice.hide();

			new TagSelectionModal(this.app, tags, async (selectedTags) => {
				await this.updateFileFrontMatter(file, selectedTags);
			}).open();
		} catch (error) {
			loadingNotice.hide();
			new Notice(`生成标签失败：${error.message}`);
		}
	}

	async analyzeTags(content: string): Promise<string[]> {
		const currentProvider = this.settings.provider;
		const providerConfig = this.settings.providerSettings[currentProvider];

		if (!providerConfig || !providerConfig.apiKey) {
			throw new Error('请先在设置中配置 API 密钥');
		}

		const config: AIServiceConfig = {
			apiKey: providerConfig.apiKey,
			apiUrl: providerConfig.apiUrl,
			model: providerConfig.model
		};

		const aiService = new AIService(config);
		try {
			return await aiService.generateTags(content);
		} catch (error) {
			throw new Error(`生成标签失败：${error.message}`);
		}
	}

	async updateFileFrontMatter(file: TFile, newTags: string[]) {
		const content = await this.app.vault.read(file);

		const yamlRegex = /^---\n([\s\S]*?)\n---/;
		const hasYaml = yamlRegex.test(content);

		let newContent;
		if (hasYaml) {
			const yamlMatch = content.match(yamlRegex);
			const yaml = yamlMatch[1];
			const tagsRegex = /^tags:\s*\[(.*)\]/m;
			const tagsMatch = yaml.match(tagsRegex);

			if (tagsMatch) {
				const existingTagsStr = tagsMatch[1];
				const existingTags = existingTagsStr
					.split(',')
					.map(tag => tag.trim())
					.filter(tag => tag !== '');

				const allTags = [...new Set([...existingTags, ...newTags])];

				newContent = content.replace(tagsRegex, `tags: [${allTags.join(', ')}]`);
			} else {
				newContent = content.replace(yamlRegex, `---\n${yaml}\ntags: [${newTags.join(', ')}]\n---`);
			}
		} else {
			newContent = `---\ntags: [${newTags.join(', ')}]\n---\n\n${content}`;
		}

		await this.app.vault.modify(file, newContent);
		new Notice(`已成功添加标签：${newTags.join(', ')}`);
	}
}

class TagSelectionModal extends Modal {
	tags: string[];
	onSubmit: (tags: string[]) => void;
	selectedTags: string[];

	constructor(app: App, tags: string[], onSubmit: (tags: string[]) => void) {
		super(app);
		this.tags = tags;
		this.onSubmit = onSubmit;
		this.selectedTags = [...tags];
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl('h3', { text: '推荐标签' });

		const tagContainer = contentEl.createDiv({ cls: 'tag-container' });

		this.tags.forEach((tag, index) => {
			const tagRow = tagContainer.createDiv({ cls: 'tag-row' });

			const checkbox = tagRow.createEl('input', {
				type: 'checkbox',
				attr: { checked: true }
			});

			const tagInput = tagRow.createEl('input', {
				type: 'text',
				value: tag
			});

			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.selectedTags[index] = tagInput.value;
				} else {
					this.selectedTags[index] = null;
				}
			});

			tagInput.addEventListener('input', () => {
				if (checkbox.checked) {
					this.selectedTags[index] = tagInput.value;
				}
			});
		});

		const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

		buttonContainer.createEl('button', { text: '取消' }).addEventListener('click', () => {
			this.close();
		});

		buttonContainer.createEl('button', { text: '确定' }).addEventListener('click', () => {
			const finalTags = this.selectedTags.filter(tag => tag !== null);
			this.onSubmit(finalTags);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class AutoTaggerSettingTab extends PluginSettingTab {
	plugin: AutoTaggerPlugin;

	constructor(app: App, plugin: AutoTaggerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h3', { text: '自动标签生成设置' });

		// 添加提供商说明
		const providerDescriptions = {
			openai: [
				'OpenAI',
				'• API 地址：https://api.openai.com/v1/chat/completions',
				'• 支持模型：gpt-4o-mini, gpt-4o, gpt-3.5-turbo'
			],
			gemini: [
				'Gemini',
				'• API 地址：https://generativelanguage.googleapis.com/v1beta/models/<MODEL_NAME>/generateContent',
				'• 支持模型：gemini-1.5-flash, gemini-2.0-flash'
			],
			claude: [
				'Claude',
				'• API 地址：https://api.anthropic.com/v1/messages',
				'• 支持模型：claude-3-5-sonnet, claude-3-7-sonnet, claude-3-opus, claude-3-haiku'
			],
			deepseek: [
				'DeepSeek - 深度求索',
				'• API 地址：https://api.deepseek.com/v1/chat/completions',
				'• 支持模型：deepseek-chat, deepseek-coder'
			],
			volcano: [
				'DeepSeek - 火山引擎',
				'• API 地址：https://ark.cn-beijing.volces.com/api/v3/chat/completions',
				'• 注意：需要在请求 URL 中添加模型服务名称'
			]
		};

		const showProviderInfo = (provider: string) => {
			const providerSection = containerEl.querySelector('.provider-section');
			if (providerSection) {
				providerSection.remove();
			}

			const section = containerEl.createDiv({ cls: 'provider-section' });
			const providerInfo = section.createDiv({ cls: 'provider-info' });

			providerDescriptions[provider].forEach(text => {
				providerInfo.createEl('p', { text });
			});
		};

		// 显示当前选择的提供商信息
		showProviderInfo(this.plugin.settings.provider);

		new Setting(containerEl)
			.setName('AI 提供商')
			.setDesc('选择 AI 服务提供商')
			.addDropdown(dropdown => {
				Object.keys(PROVIDER_CONFIGS).forEach(provider => {
					dropdown.addOption(provider, provider === 'openai' ? 'OpenAI' : 
						provider === 'gemini' ? 'Gemini' : 
						provider === 'claude' ? 'Claude（测试中）' : 
						provider === 'deepseek' ? 'DeepSeek - 深度求索' : 
						'DeepSeek - 火山引擎');
				});
				dropdown.setValue(this.plugin.settings.provider);
				dropdown.onChange(async (value) => {
					this.plugin.settings.provider = value;
					
					// 只在首次设置或 API 地址为空时使用默认 API URL
					if (!this.plugin.settings.providerSettings[value].apiUrl) {
						this.plugin.settings.providerSettings[value].apiUrl = PROVIDER_CONFIGS[value].defaultUrl;
					}
					this.plugin.settings.providerSettings[value].model = PROVIDER_CONFIGS[value].defaultModel;
					
					await this.plugin.saveSettings();
									// 更新提供商信息显示
					showProviderInfo(value);
					
					// 重新显示设置以反映更新
					this.display();
				});
			});

		new Setting(containerEl)
			.setName('API 密钥')
			.setDesc('输入你的 API 密钥')
			.addText(text => text
				.setPlaceholder('请输入 API 密钥')
				.setValue(this.plugin.settings.providerSettings[this.plugin.settings.provider].apiKey)
				.onChange(async (value) => {
					this.plugin.settings.providerSettings[this.plugin.settings.provider].apiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API 地址')
			.setDesc('输入 API 地址')
			.addText(text => text
				.setPlaceholder(PROVIDER_CONFIGS[this.plugin.settings.provider].defaultUrl)
				.setValue(this.plugin.settings.providerSettings[this.plugin.settings.provider].apiUrl)
				.onChange(async (value) => {
					this.plugin.settings.providerSettings[this.plugin.settings.provider].apiUrl = value;
					await this.plugin.saveSettings();
				}));

		// 为特定提供商添加提示
		if (this.plugin.settings.provider === 'gemini') {
			containerEl.createEl('div', { 
				text: '注意：Gemini API URL 应以 https://generativelanguage.googleapis.com/v1beta/models/ 开头，模型名称将自动添加。', 
				cls: 'setting-item-description' 
			});
		} else if (this.plugin.settings.provider === 'volcano') {
			containerEl.createEl('div', { 
				text: '注意：火山引擎 API URL 应以 https://ark.cn-beijing.volces.com/api/v3/chat/completions 开头，模型服务名称将自动添加。', 
				cls: 'setting-item-description' 
			});
		}

		new Setting(containerEl)
			.setName('模型')
			.setDesc('选择 AI 模型')
			.addDropdown(dropdown => {
				const models = PROVIDER_CONFIGS[this.plugin.settings.provider].models;
				models.forEach(model => {
					dropdown.addOption(model, model);
				});
				
				// 如果当前设置的模型不在列表中，则添加它
				if (!models.includes(this.plugin.settings.model)) {
					dropdown.addOption(this.plugin.settings.model, this.plugin.settings.model);
				}
				
				dropdown.setValue(this.plugin.settings.providerSettings[this.plugin.settings.provider].model);
				dropdown.onChange(async (value) => {
					this.plugin.settings.providerSettings[this.plugin.settings.provider].model = value;
					await this.plugin.saveSettings();
				});
			});

		// 为每个提供商添加自定义模型输入
		new Setting(containerEl)
			.setName('自定义模型')
			.setDesc('输入自定义模型名称 (可选)')
			.addText(text => text
				.setPlaceholder('自定义模型名称')
				.setValue(this.plugin.settings.providerSettings[this.plugin.settings.provider].model)
				.onChange(async (value) => {
					if (value) {
						this.plugin.settings.providerSettings[this.plugin.settings.provider].model = value;
						await this.plugin.saveSettings();
						this.display(); // 重新加载设置以更新下拉列表
					}
				}));


	}
}
