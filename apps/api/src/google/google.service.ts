import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PrismaService } from '../prisma.service';

// Google workspace access via the stored Better Auth OAuth tokens.
// Reads execute directly; every send goes through the approvals gate.
@Injectable()
export class GoogleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async connected(userId: string): Promise<boolean> {
    const acct = await this.prisma.account.findFirst({ where: { userId, providerId: 'google' } });
    return !!acct?.refreshToken;
  }

  private async client(userId: string) {
    const acct = await this.prisma.account.findFirst({ where: { userId, providerId: 'google' } });
    if (!acct?.refreshToken) throw new UnauthorizedException('Google not connected for this user');
    const oauth = new google.auth.OAuth2(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
    );
    oauth.setCredentials({ refresh_token: acct.refreshToken });
    // Refresh proactively when expiring within 5 minutes.
    if (!acct.accessTokenExpiresAt || acct.accessTokenExpiresAt.getTime() - Date.now() < 5 * 60_000) {
      const { credentials } = await oauth.refreshAccessToken();
      await this.prisma.account.update({
        where: { id: acct.id },
        data: {
          accessToken: credentials.access_token ?? acct.accessToken,
          refreshToken: credentials.refresh_token ?? acct.refreshToken,
          accessTokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
        },
      });
      oauth.setCredentials({ access_token: credentials.access_token ?? undefined, refresh_token: credentials.refresh_token ?? acct.refreshToken });
    } else if (acct.accessToken) {
      oauth.setCredentials({ access_token: acct.accessToken, refresh_token: acct.refreshToken });
    }
    return oauth;
  }

  async listGmail(userId: string, max = 10) {
    const auth = await this.client(userId);
    const gmail = google.gmail({ version: 'v1', auth });
    const { data } = await gmail.users.messages.list({ userId: 'me', maxResults: max });
    const out: { id: string; from: string; subject: string; snippet: string; date: string }[] = [];
    for (const m of data.messages ?? []) {
      const full = await gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
      const h = Object.fromEntries((full.data.payload?.headers ?? []).map((x) => [x.name!, x.value ?? '']));
      out.push({ id: m.id!, from: h['From'] ?? '', subject: h['Subject'] ?? '', snippet: full.data.snippet ?? '', date: h['Date'] ?? '' });
    }
    return out;
  }

  async sendGmail(
    userId: string,
    to: string | string[],
    subject: string,
    body: string,
    opts?: { cc?: string[]; bcc?: string[]; attachments?: { filename: string; mimeType: string; contentBase64: string }[] },
  ) {
    const auth = await this.client(userId);
    const gmail = google.gmail({ version: 'v1', auth });
    const toList = Array.isArray(to) ? to : [to];
    const cc = opts?.cc ?? [];
    const bcc = opts?.bcc ?? [];
    const attachments = opts?.attachments ?? [];
    let mime: string;
    if (attachments.length === 0) {
      mime =
        `To: ${toList.join(', ')}\r\n` +
        (cc.length > 0 ? `Cc: ${cc.join(', ')}\r\n` : '') +
        (bcc.length > 0 ? `Bcc: ${bcc.join(', ')}\r\n` : '') +
        `Subject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
    } else {
      const boundary = `remy-${Date.now().toString(36)}`;
      const parts = [
        `To: ${toList.join(', ')}`,
        ...(cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
        ...(bcc.length > 0 ? [`Bcc: ${bcc.join(', ')}`] : []),
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ];
      for (const a of attachments) {
        parts.push(
          `--${boundary}`,
          `Content-Type: ${a.mimeType}; name="${a.filename}"`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: attachment; filename="${a.filename}"`,
          '',
          a.contentBase64.replace(/\r?\n/g, ''),
        );
      }
      parts.push(`--${boundary}--`, '');
      mime = parts.join('\r\n');
    }
    const raw = Buffer.from(mime)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const { data } = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return { gmailId: data.id };
  }

  async listCalendar(userId: string, timeMin?: string, timeMax?: string) {
    const auth = await this.client(userId);
    const cal = google.calendar({ version: 'v3', auth });
    const { data } = await cal.events.list({
      calendarId: 'primary',
      timeMin: timeMin ?? new Date().toISOString(),
      timeMax,
      maxResults: 20,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return (data.items ?? []).map((e) => ({
      externalId: e.id!,
      title: e.summary ?? '(no title)',
      startsAt: e.start?.dateTime ?? e.start?.date ?? '',
      endsAt: e.end?.dateTime ?? e.end?.date ?? '',
      attendees: (e.attendees ?? []).map((a) => a.email).filter((x): x is string => !!x),
      location: e.location ?? undefined,
    }));
  }
}
