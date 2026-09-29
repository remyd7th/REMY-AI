import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Provider-agnostic gateway (OpenAI-compatible). Ollama when reachable,
// deterministic stub otherwise — same pattern as R2Service.
@Injectable()
export class LlmService {
  private host: string;
  private model: string;

  constructor(private readonly config: ConfigService) {
    this.host = this.config.get<string>('OLLAMA_HOST') ?? 'http://localhost:11434';
    this.model = this.config.get<string>('OLLAMA_MODEL') ?? 'llama3.2:1b';
  }

  get provider(): string {
    return 'ollama';
  }

  async reachable(timeoutMs = 3000): Promise<boolean> {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(`${this.host}/api/tags`, { signal: ctl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  // Conversational fallback only — structured replies are composed by tools.
  async complete(system: string, user: string, timeoutMs = 60000): Promise<{ text: string; via: string }> {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(`${this.host}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          stream: false,
        }),
        signal: ctl.signal,
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('Empty completion');
      return { text, via: `ollama:${this.model}` };
    } catch {
      return {
        text: 'I understood your message, but my language model is not reachable right now. Your structured actions below still work.',
        via: 'stub',
      };
    }
  }
}
