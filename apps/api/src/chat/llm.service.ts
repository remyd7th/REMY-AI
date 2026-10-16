import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Groq-hosted LLM gateway (OpenAI-compatible). Requires GROQ_API_KEY.
// Same graceful pattern as R2Service: throws clearly when unconfigured,
// deterministic stub when unreachable.
interface Completion {
  text: string;
  via: string;
}

@Injectable()
export class LlmService {
  private groqKey: string;
  private groqModel: string;

  constructor(private readonly config: ConfigService) {
    this.groqKey = this.config.get<string>('GROQ_API_KEY') ?? '';
    this.groqModel = this.config.get<string>('GROQ_MODEL') ?? 'openai/gpt-oss-120b';
  }

  get provider(): string {
    return 'groq';
  }

  private async groq(messages: { role: string; content: string }[], timeoutMs: number): Promise<string> {
    if (!this.groqKey) throw new Error('GROQ_API_KEY not set');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.groqKey}` },
        body: JSON.stringify({ model: this.groqModel, messages, stream: false }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('Empty completion');
      return text;
    } finally {
      clearTimeout(t);
    }
  }

  // Conversational fallback only — structured replies are composed by tools.
  async complete(
    system: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    timeoutMs = 60000,
  ): Promise<Completion> {
    // Keep the latest context within a predictable token budget. The current
    // message is already included because chat persists it before generation.
    const context = history.slice(-20).map((message) => ({
      role: message.role,
      content: message.content.slice(-6000),
    }));
    while (context.length > 1 && context.reduce((total, item) => total + item.content.length, 0) > 24000) context.shift();
    const messages = [{ role: 'system', content: system }, ...context];
    try {
      return { text: await this.groq(messages, timeoutMs), via: `groq:${this.groqModel}` };
    } catch {
      /* fall through to stub */
    }
    return {
      text: 'I understood your message, but no language model is reachable right now. Your structured actions below still work.',
      via: 'stub',
    };
  }
}
