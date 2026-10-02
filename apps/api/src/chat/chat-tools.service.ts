import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface SuggestedAction {
  label: string;
  method: 'GET' | 'POST' | 'PATCH';
  endpoint: string;
  body?: unknown;
}

// Rule-based tool layer (v1). Reads execute directly; every write creates
// a pending Approval — nothing sends/schedules without the gate.
@Injectable()
export class ChatToolsService {
  constructor(private readonly prisma: PrismaService) {}

  async workload(userId: string, workspaceId: string) {
    const scope = { workspaceId, userId };
    const now = new Date();
    const [open, overdue, blocking] = await Promise.all([
      this.prisma.task.count({ where: { ...scope, status: 'open' } }),
      this.prisma.task.count({ where: { ...scope, status: 'open', dueAt: { lt: now } } }),
      this.prisma.task.findMany({
        where: { ...scope, status: 'open' },
        orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
        take: 5,
      }),
    ]);
    const top = blocking.map((t) => `• ${t.title}${t.dueAt ? ` (due ${t.dueAt.toISOString().slice(0, 10)})` : ''}`);
    return {
      reply: `You have ${open} open tasks${overdue > 0 ? `, ${overdue} overdue` : ''}.\n${top.join('\n')}${
        overdue > 0 ? '\nWant me to draft a reprioritized plan for approval?' : ''
      }`,
      suggestedActions: [
        { label: 'Show all tasks', method: 'GET', endpoint: `/api/tasks?workspaceId=${workspaceId}&userId=${userId}` },
        ...(overdue > 0
          ? [{ label: 'Show overdue', method: 'GET', endpoint: `/api/tasks/overdue?workspaceId=${workspaceId}&userId=${userId}` }]
          : []),
      ] as SuggestedAction[],
    };
  }

  async briefing(userId: string, workspaceId: string) {
    const scope = { workspaceId, userId };
    const now = new Date();
    const eod = new Date(now);
    eod.setHours(23, 59, 59, 999);
    const [tasks, overdue, meetings, emails, followups] = await Promise.all([
      this.prisma.task.count({ where: { ...scope, status: 'open' } }),
      this.prisma.task.count({ where: { ...scope, status: 'open', dueAt: { lt: now } } }),
      this.prisma.event.count({ where: { ...scope, startsAt: { gte: now, lte: eod } } }),
      this.prisma.email.count({ where: { ...scope, status: 'open', needsReply: true } }),
      this.prisma.followup.count({ where: { ...scope, status: { in: ['open', 'nudged'] } } }),
    ]);
    return {
      reply: `Good morning. Here's what needs your attention: ${tasks} open tasks (${overdue} overdue), ${meetings} meetings today, ${emails} emails needing replies, ${followups} open follow-ups.`,
      suggestedActions: [
        { label: 'Open Today', method: 'GET', endpoint: `/api/today?workspaceId=${workspaceId}&userId=${userId}` },
        { label: 'Meetings needing prep', method: 'GET', endpoint: `/api/events/needing-prep?workspaceId=${workspaceId}&userId=${userId}` },
      ] as SuggestedAction[],
    };
  }

  async draftFollowUp(userId: string, workspaceId: string, to: string, context?: string) {
    const approval = await this.prisma.approval.create({
      data: {
        userId,
        workspaceId,
        action: 'sendEmail',
        payload: {
          to,
          purpose: 'follow-up',
          tone: 'professional',
          body: `Hello ${to},\n\nI wanted to follow up on my previous message${context ? ` regarding ${context}` : ''} and check whether you have had a chance to review it. Please let me know if you need anything from my side.\n\nBest regards`,
        },
      },
    });
    return {
      reply: `Drafted a follow-up to ${to}. It's pending your approval — nothing was sent.${
        to.includes('@') ? '' : ` I still need a real email address for ${to}: open Approvals, edit the draft's To field, then approve.`
      } After approving, press Execute in Approvals to actually send it.`,
      suggestedActions: [
        { label: 'Approve', method: 'POST', endpoint: `/api/approvals/${approval.id}/approve` },
        { label: 'Review approvals', method: 'GET', endpoint: `/api/approvals?workspaceId=${workspaceId}&userId=${userId}` },
      ] as SuggestedAction[],
      pendingApproval: approval,
    };
  }
}
