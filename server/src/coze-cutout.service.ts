import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type CozeWorkflowMessage = {
  content?: unknown;
  data?: unknown;
};

@Injectable()
export class CozeCutoutService {
  constructor(private readonly configService: ConfigService) {}

  async removeBackground(inputUrl: string): Promise<string> {
    if (!inputUrl || !/^https?:\/\//i.test(inputUrl)) {
      throw new BadRequestException('inputUrl must be a public http(s) image URL');
    }

    const token = this.configService.get<string>('COZE_API_TOKEN')?.trim();
    const workflowId = this.configService.get<string>('COZE_CUTOUT_WORKFLOW_ID')?.trim();
    const appId = this.configService.get<string>('COZE_CUTOUT_APP_ID')?.trim();

    if (!token || !workflowId || !appId) {
      throw new ServiceUnavailableException('cutout workflow is not configured');
    }

    const response = await fetch('https://api.coze.cn/v1/workflow/stream_run', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        app_id: appId,
        parameters: {
          input: inputUrl,
        },
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new ServiceUnavailableException(`cutout workflow failed: ${text.slice(0, 300)}`);
    }

    const imageUrl = this.extractImageUrl(text);
    if (!imageUrl) {
      throw new ServiceUnavailableException('cutout workflow did not return an image URL');
    }

    return this.resolveRedirectUrl(imageUrl);
  }

  private extractImageUrl(streamText: string): string {
    const parsedMessages = this.parseStreamMessages(streamText);
    for (let i = parsedMessages.length - 1; i >= 0; i -= 1) {
      const url = this.findImageUrl(parsedMessages[i]);
      if (url) return url;
    }
    return '';
  }

  private parseStreamMessages(streamText: string): unknown[] {
    const messages: unknown[] = [];
    const lines = streamText.split(/\r?\n/);
    let currentEvent = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('event:')) {
        currentEvent = trimmed.replace(/^event:\s*/, '');
        continue;
      }
      if (!trimmed.startsWith('data:')) continue;
      if (currentEvent && currentEvent !== 'Message') continue;

      const payload = trimmed.replace(/^data:\s*/, '');
      if (!payload || payload === '[DONE]') continue;

      try {
        const parsed = JSON.parse(payload) as CozeWorkflowMessage;
        messages.push(parsed);
        if (typeof parsed.content === 'string') {
          messages.push(JSON.parse(parsed.content));
        }
        if (typeof parsed.data === 'string') {
          messages.push(JSON.parse(parsed.data));
        }
      } catch {
        const fallbackUrl = this.findImageUrl(payload);
        if (fallbackUrl) messages.push({ url: fallbackUrl });
      }
    }

    return messages;
  }

  private findImageUrl(value: unknown): string {
    if (!value) return '';

    if (typeof value === 'string') {
      const urls = value.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
      return urls[0] || '';
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const url = this.findImageUrl(item);
        if (url) return url;
      }
      return '';
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const preferredKeys = ['image', 'image_url', 'imageUrl', 'url', 'output', 'result'];
      for (const key of preferredKeys) {
        const url = this.findImageUrl(record[key]);
        if (url) return url;
      }
      for (const item of Object.values(record)) {
        const url = this.findImageUrl(item);
        if (url) return url;
      }
    }

    return '';
  }

  private async resolveRedirectUrl(url: string): Promise<string> {
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      return response.url || url;
    } catch {
      return url;
    }
  }
}
