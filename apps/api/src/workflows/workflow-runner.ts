import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GoogleService } from '../google/google.service';
import type { PlanStep, StepResult } from './workflow-plan';

interface RunCtx {
  userId: string;
  workspaceId: string;
  gathered: string[];
  tasksCreated: number;
  draftsCreated: number;
  approvalIds: string[];
}

const top = (xs: string[], max = 3) => (xs.length > max ? `${xs.slice(0, max).join('; ')} (+${xs.length - max} more)` : xs.join('; '));

/** Real step execution. Gathers read, prepares write internal records,
 *  side-effects only ever create approvals — nothing external fires here. */
@Injectable()
export class WorkflowRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
  ) {}

  private scope(ctx: RunCtx) {
    return { workspaceId: ctx.workspaceId, userId: ctx.userId };
  }

  private async gather(step: PlanStep, ctx: RunCtx): Promise<Omit<StepResult, 'stepId' | 'kind' | 'op' | 'label' | 'at'>> {
    const scope = this.scope(ctx);
    const now = new Date();
    switch (step.op) {
      case 'emails.needsReply': {
        const list = await this.prisma.email.findMany({ where: { ...scope, needsReply: true }, take: 5, orderBy: { createdAt: 'desc' } });
        const n = await this.prisma.email.count({ where: { ...scope, needsReply: true } });
        const msg = n === 0 ? 'No emails need replies.' : `Found ${n} email${n === 1 ? '' : 's'} needing replies${list.length ? `: ${top(list.map((e) => e.subject))}` : ''}.`;
        if (n > 0) ctx.gathered.push(msg);
        return { status: 'completed', message: msg };
      }
      case 'tasks.open': {
        const n = await this.prisma.task.count({ where: { ...scope, status: 'open' } });
        const msg = `${n} open task${n === 1 ? '' : 's'}.`;
        ctx.gathered.push(msg);
        return { status: 'completed', message: msg };
      }
      case 'tasks.overdue': {
        const list = await this.prisma.task.findMany({ where: { ...scope, status: 'open', dueAt: { lt: now } }, take: 5 });
        const msg = list.length === 0 ? 'Nothing overdue.' : `${list.length} overdue: ${top(list.map((t) => t.title))}.`;
        if (list.length > 0) ctx.gathered.push(msg);
        return { status: 'completed', message: msg };
      }
      case 'events.today': {
        const eod = new Date(now);
        eod.setHours(23, 59, 59, 999);
        const list = await this.prisma.event.findMany({ where: { ...scope, startsAt: { gte: now, lte: eod } }, take: 5, orderBy: { startsAt: 'asc' } });
        const msg = list.length === 0 ? 'No meetings today.' : `${list.length} meeting${list.length === 1 ? '' : 's'} today: ${top(list.map((e) => e.title))}.`;
        if (list.length > 0) ctx.gathered.push(msg);
        return { status: 'completed', message: msg };
      }
      case 'events.upcoming': {
        const soon = new Date(now.getTime() + 48 * 3600_000);
        const list = await this.prisma.event.findMany({ where: { ...scope, startsAt: { gte: now, lte: soon } }, take: 5, orderBy: { startsAt: 'asc' } });
        const msg = list.length === 0 ? 'No meetings in the next 48 hours.' : `${list.length} upcoming: ${top(list.map((e) => e.title))}.`;
        if (list.length > 0) ctx.gathered.push(msg);
        return { status: 'completed', message: msg };
      }
      case 'approvals.pending': {
        const n = await this.prisma.approval.count({ where: { ...scope, status: 'pending' } });
        const msg = n === 0 ? 'No pending approvals.' : `${n} approval${n === 1 ? '' : 's'} waiting for review.`;
        if (n > 0) ctx.gathered.push(msg);
        return { status: 'completed', message: msg };
      }
      case 'docs.recent': {
        const list = await this.prisma.document.findMany({ where: scope, take: 5, orderBy: { updatedAt: 'desc' } });
        const msg = list.length === 0 ? 'No documents found.' : `Latest documents: ${top(list.map((d) => d.title))}.`;
        if (list.length > 0) ctx.gathered.push(msg);
        return { status: 'completed', message: msg };
      }
      case 'followups.open': {
        const list = await this.prisma.followup.findMany({ where: { ...scope, status: { in: ['open', 'nudged'] } }, take: 5 });
        const msg = list.length === 0 ? 'No open follow-ups.' : `${list.length} open follow-up${list.length === 1 ? '' : 's'}.`;
        if (list.length > 0) ctx.gathered.push(msg);
        return { status: 'completed', message: msg };
      }
      case 'calendar.google': {
        if (!(await this.google.connected(ctx.userId))) {
          return { status: 'skipped', message: 'Connection required — connect Google to read the live calendar.' };
        }
        const items = await this.google.listCalendar(ctx.userId);
        const msg = items.length === 0 ? 'Google calendar is clear.' : `Next on Google calendar: ${top(items.map((e) => e.title))}.`;
        if (items.length > 0) ctx.gathered.push(msg);
        return { status: 'completed', message: msg };
      }
      default:
        return { status: 'skipped', message: `Unknown gather step "${step.op}" — skipped.` };
    }
  }

  private async prepare(
    step: PlanStep, ctx: RunCtx, workflowName: string,
  ): Promise<Omit<StepResult, 'stepId' | 'kind' | 'op' | 'label' | 'at'>> {
    const scope = this.scope(ctx);
    const params = (step.params ?? {}) as Record<string, unknown>;
    switch (step.op) {
      case 'task.create': {
        const title = typeof params.title === 'string' && params.title ? params.title : step.label;
        const dueInDays = typeof params.dueInDays === 'number' ? params.dueInDays : undefined;
        const task = await this.prisma.task.create({
          data: {
            ...scope, title: title.slice(0, 200), priority: 'normal', source: 'workflow',
            ...(dueInDays !== undefined ? { dueAt: new Date(Date.now() + dueInDays * 86_400_000) } : {}),
          },
        });
        ctx.tasksCreated += 1;
        return { status: 'completed', message: `Task created: "${task.title}".` };
      }
      case 'checklist.create': {
        const items = Array.isArray(params.items) ? params.items.filter((x): x is string => typeof x === 'string') : [];
        if (items.length === 0) return { status: 'skipped', message: 'Checklist had no items — skipped.' };
        for (const item of items.slice(0, 10)) {
          await this.prisma.task.create({ data: { ...scope, title: `${workflowName}: ${item}`.slice(0, 200), priority: 'normal', source: 'workflow' } });
          ctx.tasksCreated += 1;
        }
        return { status: 'completed', message: `${Math.min(items.length, 10)} checklist tasks created.` };
      }
      case 'email.draft': {
        const to = Array.isArray(params.to) ? params.to.filter((x): x is string => typeof x === 'string') : [];
        const subject = typeof params.subject === 'string' && params.subject ? params.subject : `${workflowName}: follow-up`;
        const body = typeof params.body === 'string' && params.body
          ? params.body
          : `Hello,\n\n${ctx.gathered.length > 0 ? `Context: ${ctx.gathered.join(' ')}` : 'Please see below.'}\n\nBest regards`;
        const approval = await this.prisma.approval.create({
          data: { ...scope, action: 'sendEmail', payload: { to, subject, purpose: 'email', tone: 'professional', body } as never },
        });
        ctx.draftsCreated += 1;
        ctx.approvalIds.push(approval.id);
        return {
          status: 'completed',
          message: to.length > 0 && to.every((t) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t))
            ? `Draft ready for ${to.join(', ')} — waiting for your approval.`
            : 'Draft ready, but recipients are missing — edit the draft in Approvals first.',
          approvalIds: [approval.id],
        };
      }
      case 'briefing.compose': {
        const lines = ctx.gathered.length > 0 ? ctx.gathered : ['Nothing new found.'];
        return { status: 'completed', message: `Summary: ${lines.join(' ')}`.slice(0, 500) };
      }
      default:
        return { status: 'skipped', message: `Unknown prepare step "${step.op}" — skipped.` };
    }
  }

  /** Execute every step in order, persisting progress after each one. */
  async execute(workflowId: string, userId: string, workspaceId: string): Promise<{ runId: string; summary: Record<string, unknown> }> {
    const wf = await this.prisma.workflow.findUniqueOrThrow({ where: { id: workflowId } });
    const rawSteps = Array.isArray(wf.steps) ? (wf.steps as unknown[]) : [];
    // Back-compat: legacy string[] steps become gather notes.
    const steps = rawSteps.map((s, i) => {
      if (typeof s === 'string') {
        return { id: `legacy-${i}`, kind: 'gather' as const, op: 'note', label: s };
      }
      const o = s as { id?: string; kind?: string; op?: string; label?: string; params?: Record<string, unknown> };
      return {
        id: typeof o.id === 'string' ? o.id : `step-${i}`,
        kind: (['gather', 'prepare', 'approval', 'side_effect'].includes(o.kind ?? '') ? o.kind : 'gather') as PlanStep['kind'],
        op: typeof o.op === 'string' ? o.op : 'note',
        label: typeof o.label === 'string' ? o.label : `Step ${i + 1}`,
        params: o.params,
      };
    });
    const started = Date.now();
    const ctx: RunCtx = { userId, workspaceId, gathered: [], tasksCreated: 0, draftsCreated: 0, approvalIds: [] };
    const run = await this.prisma.workflowRun.create({
      data: { workflowId, userId, workspaceId, status: 'running', log: [] },
    });
    const results: StepResult[] = [];
    const save = (status: string) =>
      this.prisma.workflowRun.update({ where: { id: run.id }, data: { status, log: results as never } });

    for (const step of steps) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        let partial: Omit<StepResult, 'stepId' | 'kind' | 'op' | 'label' | 'at'>;
        if (step.kind === 'gather') partial = await this.gather(step, ctx);
        else if (step.kind === 'prepare') partial = await this.prepare(step, ctx, wf.name);
        else if (step.kind === 'approval') {
          const pending = ctx.approvalIds.length > 0
            ? (await this.prisma.approval.findMany({ where: { id: { in: ctx.approvalIds }, status: 'pending' } })).length
            : 0;
          partial = pending > 0
            ? { status: 'waiting_approval', message: `${pending} action${pending === 1 ? '' : 's'} waiting for your approval in Approvals.`, approvalIds: ctx.approvalIds }
            : { status: 'completed', message: 'Nothing awaiting approval.' };
        } else if (step.kind === 'side_effect' && step.op === 'email.send') {
          const params = (step.params ?? {}) as Record<string, unknown>;
          const to = Array.isArray(params.to) ? params.to.filter((x): x is string => typeof x === 'string') : [];
          const approval = await this.prisma.approval.create({
            data: {
              ...this.scope(ctx), action: 'sendEmail',
              payload: {
                to, subject: typeof params.subject === 'string' ? params.subject : `${wf.name}: message`,
                purpose: 'email', tone: 'professional',
                body: typeof params.body === 'string' ? params.body : `Hello,\n\n${ctx.gathered.join(' ') || 'Please see below.'}\n\nBest regards`,
              } as never,
            },
          });
          ctx.draftsCreated += 1;
          ctx.approvalIds.push(approval.id);
          partial = to.length > 0
            ? { status: 'waiting_approval', message: `Send prepared for ${to.join(', ')} — approve in Approvals to deliver.`, approvalIds: [approval.id] }
            : { status: 'waiting_approval', message: 'Send prepared, but recipients are missing — edit the draft in Approvals.', approvalIds: [approval.id] };
        } else {
          partial = { status: 'skipped', message: `Unknown step "${step.op}" — skipped.` };
        }
        results.push({ stepId: step.id, kind: step.kind, op: step.op, label: step.label, ...partial, at: new Date().toISOString() });
      } catch (e) {
        results.push({
          stepId: step.id, kind: step.kind, op: step.op, label: step.label,
          status: 'failed', message: `Step failed: ${e instanceof Error ? e.message : String(e)}. Fix the cause, then run again.`,
          at: new Date().toISOString(),
        });
        await save('failed');
        await this.prisma.workflow.update({ where: { id: workflowId }, data: { lastRunAt: new Date() } });
        return { runId: run.id, summary: this.summarize(results, started) };
      }
      const waiting = results.some((r) => r.status === 'waiting_approval');
      await save(waiting ? 'waiting_approval' : 'running');
    }

    const failed = results.some((r) => r.status === 'failed');
    const waiting = results.some((r) => r.status === 'waiting_approval');
    const finalStatus = failed ? 'failed' : waiting ? 'waiting_approval' : 'completed';
    await save(finalStatus);
    await this.prisma.workflow.update({ where: { id: workflowId }, data: { lastRunAt: new Date() } });
    return { runId: run.id, summary: this.summarize(results, started) };
  }

  summarize(results: StepResult[], started: number): Record<string, unknown> {
    const count = (s: StepResult['status']) => results.filter((r) => r.status === s).length;
    return {
      total: results.length,
      completed: count('completed'),
      waiting: count('waiting_approval'),
      skipped: count('skipped'),
      failed: count('failed'),
      seconds: Math.round((Date.now() - started) / 1000),
      lines: results.map((r) => {
        const icon = r.status === 'completed' ? '✓' : r.status === 'waiting_approval' ? '●' : r.status === 'failed' ? '✗' : '○';
        return `${icon} ${r.label} — ${r.message}`;
      }),
    };
  }
}
