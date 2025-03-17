import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, Modal, MarkdownView, DropdownComponent } from 'obsidian';

interface AutoTaggerSettings {
	apiKey: string;
	apiUrl: string;
	model: string;
	provider: string;
}

const DEFAULT_SETTINGS: AutoTaggerSettings = {
	apiKey: '',
	apiUrl: 'https://api.openai.com/v1/chat/completions',
	model: 'gpt-4o-mini',
	provider: 'openai'
}

const PROVIDER_CONFIGS = {
	openai: {
		defaultUrl: 'https://api.openai.com/v1/chat/completions',
		defaultModel: 'gpt-4o-mini',
		models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo']
	},
	gemini: {
		defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/models/',
		defaultModel: 'gemini-pro',
		models: ['gemini-pro', 'gemini-ultra']
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
		if (!this.settings.apiKey) {
			throw new Error('请先在设置中配置 API 密钥');
		}

		switch (this.settings.provider) {
			case 'openai':
				return this.analyzeWithOpenAI(content);
			case 'gemini':
				return this.analyzeWithGemini(content);
			case 'claude':
				return this.analyzeWithClaude(content);
			case 'deepseek':
				return this.analyzeWithDeepSeek(content);
			case 'volcano':
				return this.analyzeWithVolcano(content);
			default:
				throw new Error('不支持的 AI 提供商');
		}
	}

	async analyzeWithOpenAI(content: string): Promise<string[]> {
		const response = await fetch(this.settings.apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.settings.apiKey}`
			},
			body: JSON.stringify({
				model: this.settings.model,
				messages: [
					{
						role: 'system',
						content: '你是一个文档标签生成器。请根据文档内容生成最多 3 个相关的标签。只需返回标签，用逗号分隔，不要包含其他解释或说明，禁止文本中包含空格。'
					},
					{
						role: 'user',
						content: content
					}
				]
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error?.message || '请求失败');
		}

		const data = await response.json();
		const tagsText = data.choices[0].message.content.trim();

		return this.processTags(tagsText);
	}

	async analyzeWithGemini(content: string): Promise<string[]> {
		const apiUrl = `${this.settings.apiUrl}${this.settings.model}:generateContent?key=${this.settings.apiKey}`;
		
		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				contents: [
					{
						parts: [
							{
								text: "你是一个文档标签生成器。请根据文档内容生成最多 3 个相关的标签。只需返回标签，用逗号分隔，不要包含其他解释或说明，禁止文本中包含空格。\n\n" + content
							}
						]
					}
				]
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error?.message || '请求失败');
		}

		const data = await response.json();
		const tagsText = data.candidates[0].content.parts[0].text.trim();

		return this.processTags(tagsText);
	}

	async analyzeWithClaude(content: string): Promise<string[]> {
		const response = await fetch(this.settings.apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.settings.apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: this.settings.model,
				max_tokens: 100,
				system: "你是一个文档标签生成器。请根据文档内容生成最多 3 个相关的标签。只需返回标签，用逗号分隔，不要包含其他解释或说明，禁止文本中包含空格。",
				messages: [
					{
						role: 'user',
						content: content
					}
				]
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error?.message || '请求失败');
		}

		const data = await response.json();
		const tagsText = data.content[0].text.trim();

		return this.processTags(tagsText);
	}

	async analyzeWithDeepSeek(content: string): Promise<string[]> {
		const response = await fetch(this.settings.apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.settings.apiKey}`
			},
			body: JSON.stringify({
				model: this.settings.model,
				messages: [
					{
						role: 'system',
						content: '你是一个文档标签生成器。请根据文档内容生成最多 3 个相关的标签。只需返回标签，用逗号分隔，不要包含其他解释或说明，禁止文本中包含空格。'
					},
					{
						role: 'user',
						content: content
					}
				]
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error?.message || '请求失败');
		}

		const data = await response.json();
		const tagsText = data.choices[0].message.content.trim();

		return this.processTags(tagsText);
	}

	async analyzeWithVolcano(content: string): Promise<string[]> {
		const response = await fetch(this.settings.apiUrl + this.settings.model, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.settings.apiKey}`
			},
			body: JSON.stringify({
				messages: [
					{
						role: 'system',
						content: '你是一个文档标签生成器。请根据文档内容生成最多 3 个相关的标签。只需返回标签，用逗号分隔，不要包含其他解释或说明，禁止文本中包含空格。'
					},
					{
						role: 'user',
						content: content
					}
				]
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error?.message || '请求失败');
		}

		const data = await response.json();
		const tagsText = data.choice?.message?.content?.trim() || '';

		return this.processTags(tagsText);
	}

	processTags(tagsText: string): string[] {
		return tagsText.split(',')
			.map((tag: string) => tag.trim())
			.filter((tag: string) => tag)
			.map((tag: string) => tag.replace(/\s+/g, ''));
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

		new Setting(containerEl)
			.setName('AI 提供商')
			.setDesc('选择 AI 服务提供商')
			.addDropdown(dropdown => {
				Object.keys(PROVIDER_CONFIGS).forEach(provider => {
					dropdown.addOption(provider, provider === 'openai' ? 'OpenAI' : 
						provider === 'gemini' ? 'Gemini' : 
						provider === 'claude' ? 'Claude' : 
						provider === 'deepseek' ? 'DeepSeek(深度求索)' : 
						'DeepSeek(火山引擎)');
				});
				dropdown.setValue(this.plugin.settings.provider);
				dropdown.onChange(async (value) => {
					this.plugin.settings.provider = value;
					
					// 更新默认 API URL 和模型
					this.plugin.settings.apiUrl = PROVIDER_CONFIGS[value].defaultUrl;
					this.plugin.settings.model = PROVIDER_CONFIGS[value].defaultModel;
					
					await this.plugin.saveSettings();
					
					// 重新显示设置以反映更新
					this.display();
				});
			});

		new Setting(containerEl)
			.setName('API 密钥')
			.setDesc('输入你的 API 密钥')
			.addText(text => text
				.setPlaceholder('请输入 API 密钥')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API 地址')
			.setDesc('输入 API 地址')
			.addText(text => text
				.setPlaceholder(PROVIDER_CONFIGS[this.plugin.settings.provider].defaultUrl)
				.setValue(this.plugin.settings.apiUrl)
				.onChange(async (value) => {
					this.plugin.settings.apiUrl = value;
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
				
				dropdown.setValue(this.plugin.settings.model);
				dropdown.onChange(async (value) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				});
			});

		// 为每个提供商添加自定义模型输入
		new Setting(containerEl)
			.setName('自定义模型')
			.setDesc('输入自定义模型名称 (可选)')
			.addText(text => text
				.setPlaceholder('自定义模型名称')
				.onChange(async (value) => {
					if (value) {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
						this.display(); // 重新加载设置以更新下拉列表
					}
				}));

		// 添加提供商特定的帮助信息
		containerEl.createEl('h3', { text: '提供商说明' });

		const providerInfo = containerEl.createDiv({ cls: 'provider-info' });
		
		switch (this.plugin.settings.provider) {
			case 'openai':
				providerInfo.createEl('p', { text: 'OpenAI API 使用标准的 chat completions 接口。' });
				break;
			case 'gemini':
				providerInfo.createEl('p', { text: 'Gemini API 需要以 "key=" 形式在 URL 中附加 API 密钥。在此设置中，API 密钥将自动附加到请求 URL。' });
				break;
			case 'claude':
				providerInfo.createEl('p', { text: 'Claude API 需要在请求头中添加 "x-api-key" 字段。' });
				break;
			case 'deepseek':
				providerInfo.createEl('p', { text: 'DeepSeek API 使用与 OpenAI 兼容的接口。' });
				break;
			case 'volcano':
				providerInfo.createEl('p', { text: '火山引擎 API 需要在请求 URL 中添加模型服务名称。' });
				break;
		}
	}
}
