import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Provider-agnostic gateway. Selection via LLM_PROVIDER (groq|ollama|auto,
// default auto): Groq when GROQ_API_KEY is set, else Ollama when reachable,
// else deterministic stub. Same graceful pattern as R2Service.
interface Completion {
  text: string;
  via: string;
}

@Injectable()
export class LlmService {
  private host: string;
  private model: string;
  private groqKey: string;
  private groqModel: string;
  private preference: string;

  constructor(private readonly config: ConfigService) {
    this.host = this.config.get<string>('OLLAMA_HOST') ?? 'http://localhost:11434';
    this.model = this.config.get<string>('OLLAMA_MODEL') ?? 'llama3.2:1b';
    this.groqKey = this.config.get<string>('GROQ_API_KEY') ?? '';
    this.groqModel = this.config.get<string>('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';
    this.preference = (this.config.get<string>('LLM_PROVIDER') ?? 'auto').toLowerCase();
  }

  get provider(): string {
    if (this.preference === 'groq' && this.groqKey) return 'groq';
    if (this.preference === 'ollama') return 'ollama';
    return this.groqKey ? 'groq' : 'ollama';
  }

  private async ollama(messages: { role: string; content: string }[], timeoutMs: number): Promise<string> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.host}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, messages, stream: false }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('Empty completion');
      return text;
    } finally {
      clearTimeout(t);
    }
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
  async complete(system: string, user: string, timeoutMs = 60000): Promise<Completion> {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const order =
      this.provider === 'groq' ? (['groq', 'ollama'] as const) : (['ollama', 'groq'] as const);
    for (const p of order) {
      try {
        if (p === 'groq') return { text: await this.groq(messages, timeoutMs), via: `groq:${this.groqModel}` };
        return { text: await this.ollama(messages, timeoutMs), via: `ollama:${this.model}` };
      } catch {
        /* try next provider */
      }
    }
    return {
      text: 'I understood your message, but no language model is reachable right now. Your structured actions below still work.',
      via: 'stub',
    };
  }
}
