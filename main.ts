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
	customPrompt: string;
}

const DEFAULT_SETTINGS: AutoTaggerSettings = {
	provider: 'openai',
	customPrompt: '你是一个文档标签生成器，请根据文档内容生成最多 3 个相关的标签。只需返回标签，用逗号分隔，不要包含其他解释或说明。',
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
		defaultUrl: 'https://generativelanguage.googleapis.com',
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
		models: ['deepseek-chat', 'deepseek-reasoner']
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
			model: providerConfig.model,
			customPrompt: this.settings.customPrompt
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

		contentEl.createEl('h3', { text: '标签生成' });

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

		// 添加 GitHub 链接
		const githubLink = containerEl.createEl('a', {
			text: '在 GitHub 上提交反馈',
			href: 'https://github.com/dlzmoe/obsidian-ai-tags'
		});
		githubLink.addClass('setting-item-description');
		githubLink.style.display = 'inline-block';
		githubLink.style.textAlign = 'left';
		githubLink.style.cursor = 'pointer';
		githubLink.style.color = 'var(--link-color)';

		// 添加提供商说明
		const providerDescriptions = {
			openai: [
				'OpenAI',
				'• API 地址：https://api.openai.com/v1/chat/completions',
				'• 支持模型：gpt-4o-mini, gpt-4o, gpt-3.5-turbo'
			],
			gemini: [
				'Gemini',
				'• API 地址：https://generativelanguage.googleapis.com（暂不支持代理地址）',
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
				'• 支持模型：deepseek-chat, deepseek-reasoner'
			],
			volcano: [
				'DeepSeek - 火山引擎',
				'• API 地址：https://ark.cn-beijing.volces.com/api/v3/chat/completions',
				'• 注意：需要在火山方舟设置推理模型，然后添加模型名称，如：ep-20250221084433'
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
					// 保存当前提供商的设置
					const currentProvider = this.plugin.settings.provider;
					const currentSettings = this.plugin.settings.providerSettings[currentProvider];

					// 更新提供商
					this.plugin.settings.provider = value;

					// 初始化新提供商的设置（仅在首次设置时）
					if (!this.plugin.settings.providerSettings[value]) {
						this.plugin.settings.providerSettings[value] = {
							apiKey: '',
							apiUrl: PROVIDER_CONFIGS[value].defaultUrl,
							model: PROVIDER_CONFIGS[value].defaultModel
						};
					}

					await this.plugin.saveSettings();
					showProviderInfo(value);
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
				}))
			.addButton(button => {
				button
					.setIcon('check')
					.setTooltip('测试连通性')
					.onClick(async (evt) => {
						const buttonEl = evt.currentTarget as HTMLElement;
						if (buttonEl.hasClass('loading')) return;

						const provider = this.plugin.settings.provider;
						const config = this.plugin.settings.providerSettings[provider];

						if (!config.apiKey) {
							new Notice('请先输入 API 密钥');
							return;
						}

						buttonEl.addClass('loading');
						const originalIcon = buttonEl.querySelector('.svg-icon')?.innerHTML;
						buttonEl.querySelector('.svg-icon').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-loader"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>';

						const aiService = new AIService({
							apiKey: config.apiKey,
							apiUrl: config.apiUrl,
							model: config.model
						});

						try {
							await aiService.testConnection();
							new Notice('API 连接测试成功');
						} catch (error) {
							new Notice(`API 连接测试失败: ${error.message}`);
						} finally {
							buttonEl.removeClass('loading');
							if (originalIcon) {
								buttonEl.querySelector('.svg-icon').innerHTML = originalIcon;
							}
						}
					});
			});

		new Setting(containerEl)
			.setName('API 地址')
			.setDesc('输入 API 地址')
			.addText(text => text
				.setPlaceholder(PROVIDER_CONFIGS[this.plugin.settings.provider].defaultUrl)
				.setValue(this.plugin.settings.providerSettings[this.plugin.settings.provider].apiUrl)
				.onChange(async (value) => {
					this.plugin.settings.providerSettings[this.plugin.settings.provider].apiUrl = value;
					await this.plugin.saveSettings();
				}))
			.addButton(button => {
				button
					.setIcon('reset')
					.setTooltip('恢复默认 API 地址')
					.onClick(async (evt) => {
						const buttonEl = evt.currentTarget as HTMLElement;
						if (buttonEl.hasClass('loading')) return;

						buttonEl.addClass('loading');
						const originalIcon = buttonEl.querySelector('.svg-icon')?.innerHTML;
						buttonEl.querySelector('.svg-icon').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-loader"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>';

						try {
							this.plugin.settings.providerSettings[this.plugin.settings.provider].apiUrl = 
								PROVIDER_CONFIGS[this.plugin.settings.provider].defaultUrl;
							await this.plugin.saveSettings();
							this.display();
						} finally {
							buttonEl.removeClass('loading');
							if (originalIcon) {
								buttonEl.querySelector('.svg-icon').innerHTML = originalIcon;
							}
						}
					});
			});

		// 为特定提供商添加提示
		if (this.plugin.settings.provider === 'gemini') {
			containerEl.createEl('div', { 
				text: '注意：Gemini API URL 暂不支持，请使用 https://generativelanguage.googleapis.com 作为默认地址。', 
				cls: 'setting-item-description' 
			});
		} else if (this.plugin.settings.provider === 'volcano') {
			containerEl.createEl('div', { 
				text: '注意：火山引擎 API URL 应以 https://ark.cn-beijing.volces.com/api/v3/chat/completions 开头，模型服务名称将自动添加。', 
				cls: 'setting-item-description' 
			});
		}

		// 添加预设模型下拉框
		new Setting(containerEl)
			.setName('预设模型')
			.setDesc('选择预设的 AI 模型')
			.addDropdown(dropdown => {
				const models = PROVIDER_CONFIGS[this.plugin.settings.provider].models;
				models.forEach(model => {
					dropdown.addOption(model, model);
				});
				
				// 获取当前提供商的模型设置
				const currentModel = this.plugin.settings.providerSettings[this.plugin.settings.provider].model;
				
				// 设置当前值为预设模型中的一个，如果不在预设中则选择第一个
				const defaultModel = models.includes(currentModel) ? currentModel : models[0];
				dropdown.setValue(defaultModel);
				
				dropdown.onChange(async (value) => {
					// 只有当用户没有输入自定义模型时，才使用预设模型
					const customModelInput = this.plugin.settings.providerSettings[this.plugin.settings.provider].customModel || '';
					if (!customModelInput.trim()) {
						this.plugin.settings.providerSettings[this.plugin.settings.provider].model = value;
						await this.plugin.saveSettings();
					}
				});
			})
			.settingEl.style.display = this.plugin.settings.provider === 'volcano' ? 'none' : 'flex';

		// 为每个提供商添加自定义模型输入
		new Setting(containerEl)
			.setName(this.plugin.settings.provider === 'volcano' ? '模型' : '自定义模型')
			.setDesc(this.plugin.settings.provider === 'volcano' ? '输入模型名称' : '输入自定义模型名称 (优先使用)')
			.addText(text => text
				.setPlaceholder('自定义模型名称')
				.setValue(this.plugin.settings.providerSettings[this.plugin.settings.provider].model)
				.onChange(async (value) => {
					// 更新模型设置为自定义输入的值
					this.plugin.settings.providerSettings[this.plugin.settings.provider].model = value.trim();
					await this.plugin.saveSettings();
				}));

		// 添加自定义提示词设置
		const defaultPrompt = '你是一个文档标签生成器，请根据文档内容生成最多 3 个相关的标签。只需返回标签，用逗号分隔，不要包含其他解释或说明。';
		const customPromptSetting = new Setting(containerEl)
			.setClass('custom-prompt-setting')
			.setName('自定义提示词')
			.setDesc('自定义 AI 生成标签的提示词，留空则使用默认提示词')
			.addTextArea(text => {
				text.setValue(this.plugin.settings.customPrompt || defaultPrompt)
					.onChange(async (value) => {
						this.plugin.settings.customPrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 6;
				text.inputEl.cols = 50;
				text.inputEl.style.minHeight = '150px';
				text.inputEl.style.resize = 'vertical';
			})
			.addButton(button => {
				button
					.setIcon('reset')
					.setTooltip('重置为默认提示词')
					.onClick(async () => {
						this.plugin.settings.customPrompt = defaultPrompt;
						await this.plugin.saveSettings();
						this.display();
					});
			});


	}
}
