import { Controller, Get } from '@nestjs/common';

// Public diagnostics: booleans + hostnames only. NEVER secrets or values.
@Controller('health')
export class HealthController {
  @Get()
  status() {
    const hostOf = (v: string | undefined) => {
      try {
        return v ? new URL(v.trim()).host : null;
      } catch {
        return 'invalid-url';
      }
    };
    return {
      ok: true,
      env: {
        databaseUrl: !!process.env.DATABASE_URL,
        betterAuthSecret: !!process.env.BETTER_AUTH_SECRET,
        googleConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        r2Configured: !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY),
        groqConfigured: !!process.env.GROQ_API_KEY,
      },
      hosts: {
        webUrl: hostOf(process.env.WEB_URL),
        authUrl: hostOf(process.env.BETTER_AUTH_URL),
      },
    };
  }
}
