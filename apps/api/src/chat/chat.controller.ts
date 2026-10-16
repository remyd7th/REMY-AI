import { Body, BadRequestException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { LlmService } from './llm.service';
import { ChatToolsService } from './chat-tools.service';
import { parseEmailRequest } from './email-parse';

const REMY_SYSTEM =
  'You are Remy, a calm, concise, professional general work assistant. ' +
  'Use the conversation history to understand follow-up requests. Answer clearly and action-first. ' +
  'Never claim to have sent, scheduled, or shared anything.';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

// Working Preferences (Settings -> Working preferences) genuinely shape replies.
// Keys live in the memories table (global scope, or the active workspace scope);
// absent keys fall back to the default behavior below.
const AI_PREF_KEYS = ['ai_response_length', 'ai_tone', 'ai_language', 'ai_action_oriented', 'email_tone'] as const;
type AiPrefs = Record<(typeof AI_PREF_KEYS)[number], string | null>;

const TONE_WORDS = /\burgent\b|asap|immediately|right away|\bformal\b|\bcasual\b|friendly|warm\b/;

async function aiPrefs(prisma: PrismaService, userId: string, workspaceId: string): Promise<AiPrefs> {
  const out = {} as AiPrefs;
  await Promise.all(
    AI_PREF_KEYS.map(async (key) => {
      const override = await prisma.memory.findFirst({ where: { userId, workspaceId, key } });
      const global = override
        ? null
        : await prisma.memory.findFirst({ where: { userId, scope: 'global', key, workspaceId: null } });
      out[key] = override?.value ?? global?.value ?? null;
    }),
  );
  return out;
}

function systemPromptFor(prefs: AiPrefs): string {
  const parts = [REMY_SYSTEM];
  const length = (prefs.ai_response_length ?? '').toLowerCase();
  if (length === 'concise') parts.push('Keep every reply short: a few sentences or bullets at most.');
  else if (length === 'detailed') parts.push('Give thorough replies with context and concrete next steps.');
  const tone = (prefs.ai_tone ?? '').toLowerCase();
  if (tone === 'friendly') parts.push('Use a warm, friendly tone.');
  else if (tone === 'formal') parts.push('Use a formal tone.');
  const language = (prefs.ai_language ?? '').trim();
  if (language) parts.push(`Reply in ${language.slice(0, 40)}.`);
  if ((prefs.ai_action_oriented ?? '').toLowerCase() === 'false') {
    parts.push('Lead with explanation; keep suggested actions minimal.');
  }
  return parts.join(' ');
}

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
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly tools: ChatToolsService,
  ) {}

  @Get('conversations')
  conversations(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    return this.prisma.chatConversation.findMany({
      where: { workspaceId, userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  @Post('conversations')
  async createConversation(@Body() body: { userId: string; workspaceId: string; title?: string }) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: body.workspaceId, userId: body.userId },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    return this.prisma.chatConversation.create({
      data: { userId: body.userId, workspaceId: body.workspaceId, title: body.title?.trim().slice(0, 120) || 'New conversation' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  @Get('conversations/:id/messages')
  async messages(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
  ) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id, workspaceId, userId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found.');
    return this.prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Patch('conversations/:id')
  async renameConversation(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
    @Body() body: { title?: string },
  ) {
    const title = body.title?.trim();
    if (!title || title.length > 120) throw new BadRequestException('Enter a title up to 120 characters.');
    const result = await this.prisma.chatConversation.updateMany({
      where: { id, workspaceId, userId },
      data: { title },
    });
    if (!result.count) throw new NotFoundException('Conversation not found.');
    return { id, title };
  }

  @Delete('conversations/:id')
  async deleteConversation(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
  ) {
    const result = await this.prisma.chatConversation.deleteMany({ where: { id, workspaceId, userId } });
    if (!result.count) throw new NotFoundException('Conversation not found.');
    return { deleted: true };
  }

  @Post()
  async chat(@Body() body: { userId: string; workspaceId: string; message: string }) {
    return this.answer(body, [{ role: 'user', content: body.message }]);
  }

  private async answer(
    body: { userId: string; workspaceId: string; message: string },
    history: ChatHistoryItem[],
  ) {
    const { userId, workspaceId, message } = body;
    switch (intentOf(message)) {
      case 'workload':
        return { ...(await this.tools.workload(userId, workspaceId)), via: 'tools' };
      case 'briefing':
        return { ...(await this.tools.briefing(userId, workspaceId)), via: 'tools' };
      case 'followup': {
        const parsed = parseEmailRequest(message);
        if (!TONE_WORDS.test(message)) {
          const prefs = await aiPrefs(this.prisma, userId, workspaceId);
          const fallback = (prefs.email_tone ?? '').trim().slice(0, 40);
          if (fallback) parsed.tone = fallback;
        }
        return { ...(await this.tools.draftEmail(userId, workspaceId, parsed)), via: 'tools' };
      }
      case 'task': {
        const what = (/remind me to (.+)/i.exec(message)?.[1] ?? /create (?:a )?task (?:to )?(.+)/i.exec(message)?.[1] ?? message).trim();
        const daysMatch = /\bin (\d+) days?\b/i.exec(message)?.[1];
        const dueInDays = /\btomorrow\b/i.test(message) ? 1 : daysMatch ? Number(daysMatch) : undefined;
        return { ...(await this.tools.createTask(userId, workspaceId, what.replace(/\btomorrow\b/i, '').trim() || what, dueInDays)), via: 'tools' };
      }
      case 'workflow':
        return { ...(await this.tools.suggestWorkflow(userId, workspaceId, message)), via: 'tools' };
      default: {
        const prefs = await aiPrefs(this.prisma, userId, workspaceId);
        const { text, via } = await this.llm.complete(systemPromptFor(prefs), history);
        return { reply: text, suggestedActions: [], via };
      }
    }
  }

  // Each submitted message is stored before generation; a stable client id
  // makes browser retries idempotent. Assistant output is persisted before SSE
  // begins so a dropped connection can be recovered by reopening the chat.
  @Post('stream')
  async stream(
    @Body() body: { userId: string; workspaceId: string; conversationId: string; clientMessageId?: string; message: string },
    @Res() res: Response,
  ) {
    const message = body.message?.trim();
    if (!message) throw new BadRequestException('Write a message before sending.');
    if (!body.workspaceId || !body.conversationId) throw new BadRequestException('Choose a workspace and conversation.');

    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: body.conversationId, workspaceId: body.workspaceId, userId: body.userId },
      select: { id: true, title: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found.');

    const clientMessageId = body.clientMessageId || randomUUID();
    let userMessage = await this.prisma.chatMessage.findUnique({ where: { clientMessageId } });
    if (userMessage && userMessage.conversationId !== conversation.id) {
      throw new BadRequestException('That message was already submitted in another conversation.');
    }
    if (!userMessage) {
      userMessage = await this.prisma.chatMessage.create({
        data: { conversationId: conversation.id, role: 'user', content: message, clientMessageId },
      });
      if (conversation.title === 'New conversation') {
        await this.prisma.chatConversation.update({ where: { id: conversation.id }, data: { title: message.slice(0, 60) } });
      }
    }

    let assistantMessage = await this.prisma.chatMessage.findUnique({ where: { replyToId: userMessage.id } });
    if (!assistantMessage) {
      const stored = await this.prisma.chatMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'desc' },
        take: 21,
      });
      const history = stored.reverse().map((item) => ({
        role: item.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: item.content.slice(-6000),
      }));
      let result: Awaited<ReturnType<ChatController['answer']>>;
      try {
        result = await this.answer({ ...body, message }, history);
      } catch {
        result = { reply: 'I couldn\u2019t complete that request. Your message is saved; please retry.', suggestedActions: [], via: 'error' };
      }
      assistantMessage = await this.prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: result.reply,
          actions: result.suggestedActions as never,
          replyToId: userMessage.id,
        },
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    const words = assistantMessage.content.split(/(\s+)/);
    for (const token of words) res.write(`data: ${JSON.stringify({ token })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, messageId: assistantMessage.id, suggestedActions: assistantMessage.actions, via: 'assistant' })}\n\n`);
    res.end();
  }
}
