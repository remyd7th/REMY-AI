// Natural-language email request parser (rule-based v1).
// Handles: "Send an email to Sarah, David and John telling them X",
// "Email Sarah and David", "Send the report to Sarah and CC David",
// "Tell the whole team that ...", "Send John the proposal and copy Sarah".
export interface ParsedEmail {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  content: string;
  tone: string;
  attachmentHint?: string;
  /** Names/groups we could not resolve to an address — ask, don't guess. */
  unresolved: string[];
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LEAD_VERBS = /^(send|email|e-mail|draft|write|tell|notify|forward)\b/i;

function emailsIn(text: string): string[] {
  return Array.from(new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase())));
}

/** Split "Sarah, David and John" / "Sarah and David" into names. */
function splitNames(chunk: string): string[] {
  return chunk
    .split(/,|\band\b|&|\+/i)
    .map((s) => s.replace(LEAD_VERBS, '').trim().replace(/^[.\s]+|[.\s]+$/g, ''))
    .map((s) => s.replace(/^(to|the)\s+/i, '').trim())
    .filter((s) => s.length > 0 && !/^(please|kindly|them|they|him|her|me|us)$/i.test(s))
    .map((s) => (s.length <= 60 ? s : ''))
    .filter(Boolean);
}

function subjectFor(message: string, content: string): string {
  const m = message.toLowerCase();
  if (/meet|call|standup|sync|appointment/.test(m)) {
    return /mov|postpon|reschedul|chang|cancel|new time|instead/.test(m) ? 'Meeting Time Change' : 'Meeting Update';
  }
  if (/deadline|due date|due\b/.test(m)) return 'Deadline Update';
  if (/proposal/.test(m)) return 'Proposal';
  if (/report/.test(m)) return 'Report';
  if (/invit/.test(m)) return 'Invitation';
  if (/thank/.test(m)) return 'Thank You';
  if (/follow/.test(m)) return 'Follow-up';
  if (/remind/.test(m)) return 'Reminder';
  const words = content.split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
  return words ? `Note: ${words}` : 'Follow-up';
}

function toneFor(message: string): string {
  const m = message.toLowerCase();
  if (/\burgent\b|asap|immediately|right away/.test(m)) return 'urgent';
  if (/\bformal\b/.test(m)) return 'formal';
  if (/\bcasual\b|friendly|warm\b/.test(m)) return 'friendly';
  return 'professional';
}

/** The "what to say" clause: after that/telling/about/regarding, else remainder. */
function contentOf(message: string): string {
  let m = /telling (?:them|him|her|everyone) (?:that )?(.+)/i.exec(message)?.[1]
    ?? /that (.+)/i.exec(message)?.[1]
    ?? /(?:about|regarding|concerning) (.+)/i.exec(message)?.[1]
    ?? '';
  m = m.replace(/\s*(please\s+)?(send|email|draft)(\s+it)?\s*$/i, '').trim();
  if (!m) {
    m = message
      .replace(LEAD_VERBS, '')
      .replace(/^(an?\s+)?email\s+(to\s+)?/i, '')
      .trim();
  }
  m = m.replace(/^[.\s]+/, '').trim();
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export function parseEmailRequest(message: string): ParsedEmail {
  const msg = message.trim();

  // --- zones: bcc / cc split off first so addresses land in the right bucket
  const bccMatch = /\bbcc\b[:\s]+([^.;]+)/i.exec(msg);
  const ccMatch = /\b(?:cc|carbon copy|copy|copies)\b[:\s]+([^.;]+)/i.exec(msg);
  let rest = msg;
  const bccRaw = bccMatch?.[1] ?? '';
  const ccRaw = ccMatch?.[1] ?? '';
  if (bccMatch) rest = rest.replace(bccMatch[0], ' ');
  if (ccMatch) rest = rest.replace(ccMatch[0], ' ');

  const bcc = emailsIn(bccRaw);
  const cc = emailsIn(ccRaw);
  const toEmails = emailsIn(rest).filter((e) => !cc.includes(e) && !bcc.includes(e));

  // --- names live in the recipient region: before the content clause
  const cut = rest.search(/\bthat\b|telling|about|regarding|concerning|letting\b/i);
  const region = (cut > 0 ? rest.slice(0, cut) : rest).replace(EMAIL_RE, ' ');
  const groupWord = /\b(the\s+whole\s+team|the\s+team|everyone|all\s+clients|the\s+three\s+clients)\b/i.exec(region)?.[0];
  const toNames = splitNames(region).filter(
    (n) => !ccRaw.toLowerCase().includes(n.toLowerCase()) && !bccRaw.toLowerCase().includes(n.toLowerCase()),
  );

  const to = [...toEmails, ...toNames.filter((n) => !toEmails.includes(n.toLowerCase()))];
  const ccNames = splitNames(ccRaw).filter((n) => !emailsIn(ccRaw).includes(n.toLowerCase()));
  const bccNames = splitNames(bccRaw).filter((n) => !emailsIn(bccRaw).includes(n.toLowerCase()));
  cc.push(...ccNames);
  bcc.push(...bccNames);

  const unresolved = [...toNames, ...ccNames, ...bccNames];
  if (groupWord && !unresolved.includes(groupWord)) unresolved.push(groupWord);

  const content = contentOf(msg);
  const attachmentHint = /attach(?:ing|ed|ment)?\s+(?:the\s+)?(.+?)(?:\.|$)/i.exec(msg)?.[1]?.trim()
    ?? /with\s+(?:the\s+)?(.+?)\s+attached/i.exec(msg)?.[1]?.trim();

  return {
    to: to.length > 0 ? to : [],
    cc,
    bcc,
    subject: subjectFor(msg, content),
    content: content || 'Please see my message below.',
    tone: toneFor(msg),
    attachmentHint: attachmentHint || undefined,
    unresolved,
  };
}

export function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

export function formatList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
