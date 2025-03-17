import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, Modal, MarkdownView } from 'obsidian';

interface AutoTaggerSettings {
	apiKey: string;
	apiUrl: string;
	model: string;
}

const DEFAULT_SETTINGS: AutoTaggerSettings = {
	apiKey: '',
	apiUrl: 'https://api.openai.com/v1/chat/completions',
	model: 'gpt-4o-mini'
}

export default class AutoTaggerPlugin extends Plugin {
	settings: AutoTaggerSettings;

	async onload() {
		await this.loadSettings();

		// 添加侧边栏图标
		this.addRibbonIcon('tag', '生成标签', async () => {
			await this.generateTags();
		});

		// 添加设置页面
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

		// 显示加载提示
		const loadingNotice = new Notice('正在生成标签...', 0);

		try {
			const tags = await this.analyzeTags(content);
			loadingNotice.hide();

			// 显示标签选择弹窗
			new TagSelectionModal(this.app, tags, async (selectedTags) => {
				await this.updateFileFrontMatter(file, selectedTags);
			}).open();
		} catch (error) {
			loadingNotice.hide();
			new Notice(`生成标签失败: ${error.message}`);
		}
	}

	async analyzeTags(content: string): Promise<string[]> {
		if (!this.settings.apiKey) {
			throw new Error('请先在设置中配置API密钥');
		}

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
						content: '你是一个文档标签生成器。请根据文档内容生成最多3个相关的标签。只需返回标签，用逗号分隔，不要包含其他解释或说明，禁止文本中包含空格。'
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

		// 将返回的标签文本分割为数组，并过滤掉空格
		return tagsText.split(',')
			.map((tag: string) => tag.trim())
			.filter((tag: string) => tag)
			.map((tag: string) => tag.replace(/\s+/g, '')); // 移除标签中的所有空格
	}

	async updateFileFrontMatter(file: TFile, newTags: string[]) {
		const content = await this.app.vault.read(file);

		// 检查文档是否已有YAML前言
		const yamlRegex = /^---\n([\s\S]*?)\n---/;
		const hasYaml = yamlRegex.test(content);

		let newContent;
		if (hasYaml) {
			// 检查是否已有tags
			const yamlMatch = content.match(yamlRegex);
			const yaml = yamlMatch[1];
			const tagsRegex = /^tags:\s*\[(.*)\]/m;
			const tagsMatch = yaml.match(tagsRegex);

			if (tagsMatch) {
				// 已有tags，提取已有标签并与新标签合并
				const existingTagsStr = tagsMatch[1];
				const existingTags = existingTagsStr
					.split(',')
					.map(tag => tag.trim())
					.filter(tag => tag !== '');

				// 合并新旧标签并去重
				const allTags = [...new Set([...existingTags, ...newTags])];

				// 替换现有的tags
				newContent = content.replace(tagsRegex, `tags: [${allTags.join(', ')}]`);
			} else {
				// 添加新的tags
				newContent = content.replace(yamlRegex, `---\n${yaml}\ntags: [${newTags.join(', ')}]\n---`);
			}
		} else {
			// 创建新的YAML前言
			newContent = `---\ntags: [${newTags.join(', ')}]\n---\n\n${content}`;
		}

		await this.app.vault.modify(file, newContent);
		new Notice(`已成功添加标签: ${newTags.join(', ')}`);
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
		this.selectedTags = [...tags]; // 默认全选
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl('h3', { text: '推荐标签' });

		// 创建标签选择区域
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

		// 添加按钮
		const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

		buttonContainer.createEl('button', { text: '取消' }).addEventListener('click', () => {
			this.close();
		});

		buttonContainer.createEl('button', { text: '确定' }).addEventListener('click', () => {
			// 过滤出选中的标签
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

		containerEl.createEl('h3', { text: '自动标签生成器设置' });

		new Setting(containerEl)
			.setName('API 密钥')
			.setDesc('输入你的 OpenAI API 密钥')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API 地址')
			.setDesc('输入 API 地址')
			.addText(text => text
				.setPlaceholder('https://api.openai.com/v1/chat/completions')
				.setValue(this.plugin.settings.apiUrl)
				.onChange(async (value) => {
					this.plugin.settings.apiUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('模型')
			.setDesc('选择 AI 模型')
			.addText(text => text
				.setPlaceholder('gpt-4o-mini')
				.setValue(this.plugin.settings.model)
				.onChange(async (value) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				}));
	}
}

