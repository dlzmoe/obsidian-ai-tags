import { RequestError } from '../errors/RequestError';

export interface AIServiceConfig {
    apiKey: string;
    apiUrl: string;
    model: string;
    existingTags?: string[];
}

export interface AIResponse {
    content: string;
}

export class AIService {
    private config: AIServiceConfig;
    private static SYSTEM_PROMPT = '你是一个文档标签生成器。请根据文档内容生成最多 3 个相关的标签。只需返回标签，用逗号分隔，不要包含其他解释或说明，禁止文本中包含空格。';
    private static TIMEOUT = 30000; // 30 秒超时
    private static MAX_RETRIES = 2;

    constructor(config: AIServiceConfig) {
        this.config = config;
    }

    private async makeRequest(url: string, options: RequestInit): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), AIService.TIMEOUT);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            if (!response.ok) {
                const error = await response.json();
                throw new RequestError(error.error?.message || '请求失败', response.status);
            }

            return response;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new RequestError('请求超时', 408);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async retryRequest(fn: () => Promise<Response>): Promise<Response> {
        let lastError: Error;
        for (let i = 0; i <= AIService.MAX_RETRIES; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (error instanceof RequestError && error.status >= 500) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }

    private calculateSimilarity(str1: string, str2: string): number {
        str1 = str1.toLowerCase();
        str2 = str2.toLowerCase();
        if (str1 === str2) return 1.0;
        
        const set1 = new Set(str1.split(''));
        const set2 = new Set(str2.split(''));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        
        return intersection.size / Math.max(set1.size, set2.size);
    }

    private findSimilarExistingTag(newTag: string): string | null {
        if (!this.config.existingTags?.length) return null;
        
        const similarityThreshold = 0.7;
        let mostSimilarTag = null;
        let highestSimilarity = 0;

        for (const existingTag of this.config.existingTags) {
            const similarity = this.calculateSimilarity(newTag, existingTag);
            if (similarity > similarityThreshold && similarity > highestSimilarity) {
                highestSimilarity = similarity;
                mostSimilarTag = existingTag;
            }
        }

        return mostSimilarTag;
    }

    async generateTags(content: string): Promise<string[]> {
        const provider = this.getProviderFromUrl();
        const response = await this.makeRequest(
            this.getFullApiUrl(provider),
            {
                method: 'POST',
                headers: this.getHeaders(provider),
                body: JSON.stringify(this.getRequestBody(content, provider))
            }
        );

        const data = await response.json();
        const generatedTags = this.parseResponse(data, provider);
        
        return generatedTags.map(tag => {
            const similarTag = this.findSimilarExistingTag(tag);
            return similarTag || tag;
        });
    }

    private getProviderFromUrl(): string {
        if (this.config.apiUrl.includes('generativelanguage.googleapis.com')) {
            return 'gemini';
        }
        return 'openai';
    }

    private getFullApiUrl(provider: string): string {
        if (provider === 'gemini') {
            return `${this.config.apiUrl}${this.config.model}:generateContent?key=${this.config.apiKey}`;
        }
        return this.config.apiUrl;
    }

    private getHeaders(provider: string): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (provider !== 'gemini' && this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        return headers;
    }

    private getRequestBody(content: string, provider: string): any {
        if (provider === 'gemini') {
            return {
                contents: [
                    {
                        parts: [
                            { text: AIService.SYSTEM_PROMPT },
                            { text: content }
                        ]
                    }
                ]
            };
        }

        return {
            model: this.config.model,
            messages: [
                {
                    role: 'system',
                    content: AIService.SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: content
                }
            ]
        };
    }

    private parseResponse(data: any, provider: string): string[] {
        try {
            let tagsText = '';
            if (provider === 'gemini') {
                tagsText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            } else {
                tagsText = data.choices?.[0]?.message?.content?.trim() || '';
            }

            return tagsText
                .split(',')
                .map((tag: string) => tag.trim())
                .filter((tag: string) => tag)
                .map((tag: string) => tag.replace(/\s+/g, ''));
        } catch (error) {
            throw new Error('解析 AI 响应失败');
        }
    }
}