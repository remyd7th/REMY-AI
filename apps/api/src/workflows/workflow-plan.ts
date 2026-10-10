// Workflow planning: step model, starter templates, and natural-language
// → structured plan generation (rule-based v1, same approach as email-parse).
export type StepKind = 'gather' | 'prepare' | 'approval' | 'side_effect';

export interface PlanStep {
  id: string;
  kind: StepKind;
  /** gather: emails.needsReply|tasks.open|tasks.overdue|events.today|events.upcoming|approvals.pending|docs.recent|followups.open|calendar.google
   *  prepare: task.create|checklist.create|email.draft|briefing.compose
   *  approval: checkpoint | side_effect: email.send */
  op: string;
  label: string;
  params?: Record<string, unknown>;
}

export interface StepResult {
  stepId: string;
  kind: StepKind;
  op: string;
  label: string;
  status: 'queued' | 'running' | 'completed' | 'waiting_approval' | 'skipped' | 'failed';
  message: string;
  approvalIds?: string[];
  at: string;
}

export interface GeneratedPlan {
  goal: string;
  trigger: string;
  steps: PlanStep[];
}

export const KIND_META: Record<StepKind, { label: string; note: string }> = {
  gather: { label: 'Gather', note: 'Reads information automatically.' },
  prepare: { label: 'Prepare', note: 'Prepares drafts and tasks for review.' },
  approval: { label: 'Approval', note: 'Pauses until you approve.' },
  side_effect: { label: 'Send', note: 'Only runs after your approval.' },
};

let n = 0;
const sid = (base: string) => `${base}-${++n}`;

export function blankPlan(): GeneratedPlan {
  n = 0;
  return { goal: '', trigger: 'Manual', steps: [] };
}

function hasApprovalAfter(steps: PlanStep[]): boolean {
  return steps.some((s) => s.kind === 'approval' || s.kind === 'side_effect');
}

function addApproval(steps: PlanStep[]) {
  if (!hasApprovalAfter(steps)) {
    steps.push({ id: sid('approval'), kind: 'approval', op: 'checkpoint', label: 'Request approval before sending' });
  }
}

/** "Send an email to X" style content → task title fallback. */
function taskTitleFor(message: string): string {
  const m = /tasks? for (.+?)(?:\.|$)/i.exec(message)?.[1]?.trim()
    ?? /follow.?up (?:with )?(.+?)(?:\.|$)/i.exec(message)?.[1]?.trim();
  return m ? `Follow up: ${m.slice(0, 80)}` : 'Follow up';
}

/** Convert a plain request into a structured, reviewable plan. */
export function generatePlan(message: string): GeneratedPlan {
  n = 0;
  const m = message.toLowerCase();
  const steps: PlanStep[] = [];
  let goal = 'Custom automation';
  let trigger = 'Manual';

  if (/every morning|daily|8\s*:?00\s*am|morning briefing|daily briefing/.test(m)) trigger = 'Every morning at 8:00 AM';
  else if (/new client/.test(m)) trigger = 'New client added';
  else if (/meeting/.test(m)) trigger = 'Meeting in 24 hours';
  else if (/new (document|note)/.test(m)) trigger = 'New document added';
  else if (/every (week|friday|monday)/.test(m)) trigger = 'Weekly';

  if (/inbox|email|mail/.test(m) && !/new client/.test(m)) {
    goal = 'Review and organize my inbox';
    steps.push({ id: sid('gather'), kind: 'gather', op: 'emails.needsReply', label: 'Find emails needing replies' });
    if (/urgent|important|classif/.test(m)) {
      steps.push({ id: sid('gather'), kind: 'gather', op: 'emails.needsReply', label: 'Identify urgent messages' });
    }
    if (/summar/.test(m)) {
      steps.push({ id: sid('prepare'), kind: 'prepare', op: 'briefing.compose', label: 'Summarize important threads' });
    }
    if (/task|response|respond|reply/.test(m)) {
      steps.push({ id: sid('prepare'), kind: 'prepare', op: 'task.create', label: 'Create follow-up tasks', params: { title: taskTitleFor(message) } });
    }
    if (/draft|repl/.test(m)) {
      steps.push({ id: sid('prepare'), kind: 'prepare', op: 'email.draft', label: 'Draft suggested replies' });
      addApproval(steps);
    }
  }

  if (/new client/.test(m)) {
    goal = 'Welcome and follow up with new clients';
    steps.push({ id: sid('prepare'), kind: 'prepare', op: 'task.create', label: 'Save new client details', params: { title: 'Record new client details' } });
    steps.push({ id: sid('prepare'), kind: 'prepare', op: 'email.draft', label: 'Draft welcome email', params: { subject: 'Welcome' } });
    addApproval(steps);
    steps.push({ id: sid('prepare'), kind: 'prepare', op: 'task.create', label: 'Create 3-day follow-up task', params: { title: 'Follow up with new client', dueInDays: 3 } });
  }

  if (/meeting|appointment|call with/.test(m)) {
    goal = goal === 'Custom automation' ? 'Prepare for upcoming meetings' : goal;
    steps.push({ id: sid('gather'), kind: 'gather', op: 'events.upcoming', label: 'Find upcoming meetings' });
    steps.push({ id: sid('gather'), kind: 'gather', op: 'docs.recent', label: 'Find related emails and documents' });
    steps.push({ id: sid('prepare'), kind: 'prepare', op: 'briefing.compose', label: 'Summarize relevant information' });
    steps.push({ id: sid('prepare'), kind: 'prepare', op: 'checklist.create', label: 'Create preparation checklist', params: { items: ['Review agenda', 'Confirm attendees', 'Prepare materials'] } });
    if (/remind/.test(m)) {
      steps.push({ id: sid('prepare'), kind: 'prepare', op: 'email.draft', label: 'Draft attendee reminder', params: { subject: 'Reminder' } });
      addApproval(steps);
    }
  }

  if (/deadline|due/.test(m)) {
    goal = 'Track deadlines';
    steps.push({ id: sid('gather'), kind: 'gather', op: 'tasks.overdue', label: 'Find overdue and due items' });
    steps.push({ id: sid('prepare'), kind: 'prepare', op: 'task.create', label: 'Create deadline follow-ups', params: { title: taskTitleFor(message) } });
  }

  if (/report/.test(m)) {
    goal = 'Prepare a report';
    steps.push({ id: sid('gather'), kind: 'gather', op: 'tasks.open', label: 'Check task status' });
    steps.push({ id: sid('prepare'), kind: 'prepare', op: 'briefing.compose', label: 'Prepare report summary' });
  }

  if (/(new |^)(document|note)/.test(m) || /process.*doc/.test(m)) {
    goal = 'Process documents';
    steps.push({ id: sid('gather'), kind: 'gather', op: 'docs.recent', label: 'Read the latest documents' });
    steps.push({ id: sid('prepare'), kind: 'prepare', op: 'briefing.compose', label: 'Summarize key points' });
    steps.push({ id: sid('prepare'), kind: 'prepare', op: 'task.create', label: 'Create tasks for action items', params: { title: 'Act on document action items' } });
  }

  if (/\bsend\b/.test(m) && !steps.some((s) => s.kind === 'side_effect')) {
    const to = /send (?:an? email )?to ([A-Z0-9._%+-@][^.,;]*)/i.exec(message)?.[1]?.trim();
    steps.push({
      id: sid('send'), kind: 'side_effect', op: 'email.send', label: 'Send the email',
      params: { ...(to ? { to } : {}) },
    });
  }

  if (steps.length === 0) {
    goal = 'Custom automation';
    steps.push({ id: sid('gather'), kind: 'gather', op: 'tasks.open', label: 'Check current task status' });
    steps.push({ id: sid('prepare'), kind: 'prepare', op: 'briefing.compose', label: 'Summarize what needs attention' });
  }

  return { goal, trigger, steps };
}

export interface StarterTemplate {
  name: string;
  description: string;
  trigger: string;
  steps: PlanStep[];
}

export function starterTemplates(): StarterTemplate[] {
  n = 0;
  const g = (op: string, label: string): PlanStep => ({ id: sid('g'), kind: 'gather', op, label });
  const p = (op: string, label: string, params?: Record<string, unknown>): PlanStep => ({ id: sid('p'), kind: 'prepare', op, label, params });
  const a = (label: string): PlanStep => ({ id: sid('a'), kind: 'approval', op: 'checkpoint', label });
  const s = (op: string, label: string, params?: Record<string, unknown>): PlanStep => ({ id: sid('s'), kind: 'side_effect', op, label, params });
  return [
    {
      name: 'Client Follow-up', trigger: 'New client added',
      description: 'Detect quiet clients, draft a personal note, and ask for approval before sending.',
      steps: [
        g('followups.open', 'Check previous communication'),
        p('task.create', 'Determine whether follow-up is needed', { title: 'Review client for follow-up' }),
        p('email.draft', 'Draft personalized message', { subject: 'Following up' }),
        a('Request approval before sending'),
        s('email.send', 'Send or schedule the follow-up'),
      ],
    },
    {
      name: 'Email Triage', trigger: 'Every morning at 8:00 AM',
      description: 'Fetch unread emails, flag the urgent ones, summarize threads, and draft replies for approval.',
      steps: [
        g('emails.needsReply', 'Fetch emails needing replies'),
        g('emails.needsReply', 'Identify urgent messages'),
        p('briefing.compose', 'Summarize important threads'),
        p('email.draft', 'Draft suggested replies'),
        a('Request approval before sending'),
      ],
    },
    {
      name: 'Meeting Preparation', trigger: 'Meeting in 24 hours',
      description: 'Find the meeting, pull related context, and build a prep checklist with tasks.',
      steps: [
        g('events.upcoming', 'Find upcoming meetings'),
        g('docs.recent', 'Pull related emails and documents'),
        p('briefing.compose', 'Summarize relevant information'),
        p('checklist.create', 'Create preparation checklist', { items: ['Review agenda', 'Confirm attendees', 'Prepare materials'] }),
      ],
    },
    {
      name: 'Daily Briefing', trigger: 'Every morning at 8:00 AM',
      description: 'Overdue tasks, today’s meetings, important emails, and pending approvals in one briefing.',
      steps: [
        g('tasks.overdue', 'Check overdue tasks'),
        g('events.today', 'List today’s meetings'),
        g('emails.needsReply', 'Review important emails'),
        g('approvals.pending', 'Identify pending approvals'),
        p('briefing.compose', 'Generate the daily briefing'),
      ],
    },
    {
      name: 'Document Processing', trigger: 'New document added',
      description: 'Read new documents, structure the content, and turn action items into tasks.',
      steps: [
        g('docs.recent', 'Read the latest documents'),
        p('briefing.compose', 'Summarize key points'),
        p('task.create', 'Create tasks for action items', { title: 'Act on document action items' }),
      ],
    },
    {
      name: 'Appointment Reminder', trigger: 'Meeting in 48 hours',
      description: 'Find upcoming meetings, draft reminders, and ask for approval for external messages.',
      steps: [
        g('events.upcoming', 'Find upcoming meetings'),
        p('email.draft', 'Draft attendee reminder', { subject: 'Reminder' }),
        a('Request approval for external communication'),
      ],
    },
  ];
}
