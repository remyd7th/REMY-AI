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
const LEAD = /^(send|email|e-mail|draft|write|tell|notify|forward)\b/i;

function emailsIn(text: string): string[] {
  return Array.from(new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase())));
}

/** Leading capitalized name (1–2 words) in a segment, else none. */
function namesIn(segment: string): string[] {
  const m = segment
    .replace(EMAIL_RE, ' ')
    .trim()
    .match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  return m ? [m[1]] : [];
}

function splitSegments(chunk: string): string[] {
  return chunk.split(/,|\band\b|&|\+/i).map((s) => s.trim()).filter(Boolean);
}

/** Drop the content/attachment clauses so only the recipient zone remains. */
function recipientZone(text: string): string {
  let s = text;
  s = s.replace(/\battach(?:ing|ed|ment)?\s+(?:the\s+)?.+?(?:\.|$)/gi, ' ');
  s = s.replace(/\bwith\s+(?:the\s+)?.+?\s+attached\.?/gi, ' ');
  const cut = s.search(/\bthat\b|telling|about|regarding|concerning|letting\b|\blet\b/i);
  if (cut > 0) s = s.slice(0, cut);
  return s
    .replace(LEAD, '')
    .replace(/^\s*(an?|this|that|the)?\s*(email|message)(\s+to)?/i, '')
    .replace(/^\s*to\s+/i, '')
    .trim();
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

/** The "what to say" clause; '' when the message is only routing. */
function contentOf(message: string): string {
  const m = /telling (?:them|him|her|everyone) (?:that )?(.+)/i.exec(message)?.[1]
    ?? /let (?:them|him|her|everyone|me) know (?:that )?(.+)/i.exec(message)?.[1]
    ?? /that (.+)/i.exec(message)?.[1]
    ?? /(?:about|regarding|concerning) (.+)/i.exec(message)?.[1]
    ?? '';
  return m
    .replace(/\s*(please\s+)?(send|email|draft)(\s+it)?\s*$/i, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function attachmentOf(message: string): string | undefined {
  const explicit = /attach(?:ing|ed|ment)?\s+(?:the\s+)?(.+?)(?:\.|$)/i.exec(message)?.[1]?.trim()
    ?? /with\s+(?:the\s+)?(.+?)\s+attached/i.exec(message)?.[1]?.trim();
  if (explicit) return explicit;
  return /(?:send|email|forward)\s+(?:the\s+)?([a-z][\w ]*?)\s+to\b/i.exec(message)?.[1]?.trim() || undefined;
}

export function parseEmailRequest(message: string): ParsedEmail {
  const msg = message.trim();

  // --- zones: bcc / cc split off first so addresses land in the right bucket
  const bccZone = /\bbcc\b[:\s]+([^;\n]+)/i.exec(msg)?.[1] ?? '';
  const ccZone = /\b(?:cc|carbon copy|cop(?:y|ies))\b[:\s]+([^;\n]+)/i.exec(msg)?.[1] ?? '';
  let rest = msg;
  if (bccZone) rest = rest.replace(bccZone, ' ');
  if (ccZone) rest = rest.replace(ccZone, ' ');

  const bcc = [...emailsIn(bccZone), ...splitSegments(bccZone).flatMap(namesIn)];
  const cc = [...emailsIn(ccZone), ...splitSegments(ccZone).flatMap(namesIn)];
  const zone = recipientZone(rest);
  const to = [...emailsIn(zone), ...splitSegments(zone).flatMap(namesIn)];
  const seen = new Set<string>();
  const dedup = (xs: string[]) => xs.filter((x) => (seen.has(x.toLowerCase()) ? false : (seen.add(x.toLowerCase()), true)));
  const ccFinal = dedup(cc);
  const bccFinal = dedup(bcc);
  const toFinal = dedup(to).filter(
    (t) => !ccFinal.some((c) => c.toLowerCase() === t.toLowerCase()) && !bccFinal.some((c) => c.toLowerCase() === t.toLowerCase()),
  );

  const groupWord = /\b(the\s+whole\s+team|the\s+team|everyone|the\s+three\s+clients|all\s+clients)\b/i.exec(zone)?.[0];
  const unresolved = Array.from(
    new Set([...toFinal, ...ccFinal, ...bccFinal].filter((n) => !isEmail(n)).concat(groupWord ? [groupWord] : [])),
  );

  const content = capitalize(contentOf(msg));
  const rawHint = attachmentOf(msg);
  const attachmentHint = rawHint && !/^(an?|this|that|the)?\s*(email|e-mail|message)s?$/i.test(rawHint)
    ? rawHint
    : undefined;

  return {
    to: toFinal,
    cc: ccFinal,
    bcc: bccFinal,
    subject: subjectFor(msg, content),
    content,
    tone: toneFor(msg),
    attachmentHint,
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
