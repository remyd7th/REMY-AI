import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LlmService } from './llm.service';
import { ChatToolsService } from './chat-tools.service';
import { parseEmailRequest } from './email-parse';

const REMY_SYSTEM =
  'You are Remy, a calm, concise, professional work assistant for executive and virtual assistants. ' +
  'Answer briefly and action-first. Never claim to have sent, scheduled, or shared anything.';

function intentOf(message: string): 'workload' | 'briefing' | 'followup' | 'task' | 'workflow' | 'chat' {
  const m = message.toLowerCase();
  if (/(follow.?up|draft|write|send).*(email|to |message)|email.*(draft|follow)/.test(m)) return 'followup';
  if (/\bcc\b|\bbcc\b|carbon copy/.test(m) && /(send|email|copy)/.test(m)) return 'followup';
  if (/(email|e-mail)\b/.test(m)) return 'followup';
  if (/\btell\b.*\b(team|everyone|them|him|her|clients?)\b/.test(m)) return 'followup';
  const remind = /remind me to (.+)/i.exec(message)?.[1] ?? /create (?:a )?task (?:to )?(.+)/i.exec(message)?.[1];
  if (remind) return 'task';
  if (/(every|each|whenever|each time|every time|automate|recurring)/.test(m)) return 'workflow';
  if (/(organize|priorit|overdue|tomorrow|workload|tasks)/.test(m)) return 'workload';
  if (/(morning|briefing|today|attention|overview|what.*(need|today))/.test(m)) return 'briefing';
  return 'chat';
}

@Controller('chat')
export class ChatController {
  constructor(
    private readonly llm: LlmService,
    private readonly tools: ChatToolsService,
  ) {}

  @Post()
  async chat(@Body() body: { userId: string; workspaceId: string; message: string }) {
    const { userId, workspaceId, message } = body;
    switch (intentOf(message)) {
      case 'workload':
        return { ...(await this.tools.workload(userId, workspaceId)), via: 'tools' };
      case 'briefing':
        return { ...(await this.tools.briefing(userId, workspaceId)), via: 'tools' };
      case 'followup': {
        const parsed = parseEmailRequest(message);
        return { ...(await this.tools.draftEmail(userId, workspaceId, parsed)), via: 'tools' };
      }
      case 'task': {
        const what = (/remind me to (.+)/i.exec(message)?.[1] ?? /create (?:a )?task (?:to )?(.+)/i.exec(message)?.[1] ?? message).trim();
        const dueInDays = /\btomorrow\b/i.test(message) ? 1 : /\bin (\d+) days?\b/i.exec(message)?.[1] ? Number(/\bin (\d+) days?\b/i.exec(message)![1]) : undefined;
        return { ...(await this.tools.createTask(userId, workspaceId, what.replace(/\btomorrow\b/i, '').trim() || what, dueInDays)), via: 'tools' };
      }
      case 'workflow': {
        return { ...(await this.tools.suggestWorkflow(userId, workspaceId, message)), via: 'tools' };
      }
      default: {
        const { text, via } = await this.llm.complete(REMY_SYSTEM, message);
        return { reply: text, suggestedActions: [], via };
      }
    }
  }

  // SSE replay of the composed reply (streams word-by-word for UI).
  @Post('stream')
  async stream(@Body() body: { userId: string; workspaceId: string; message: string }, @Res() res: Response) {
    const full = await this.chat(body);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const words = String(full.reply).split(/(\s+)/);
    for (const w of words) {
      res.write(`data: ${JSON.stringify({ token: w })}\n\n`);
      await new Promise((r) => setTimeout(r, 25));
    }
    res.write(`data: ${JSON.stringify({ done: true, suggestedActions: full.suggestedActions ?? [], pendingApproval: 'pendingApproval' in full ? full.pendingApproval : null, via: full.via })}\n\n`);
    res.end();
  }
}
