import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // Neon serverless Postgres may cold-start (scale-to-zero) slower than a
    // single connect attempt allows — retry with backoff instead of crashing.
    // Each attempt has its own timeout so a stalled handshake fails fast
    // instead of blocking bootstrap indefinitely.
    const attempts = 12;
    const attemptTimeoutMs = 15000;
    for (let i = 1; ; i++) {
      try {
        await Promise.race([
          this.$connect(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Prisma connect timed out after ${attemptTimeoutMs}ms`)), attemptTimeoutMs),
          ),
        ]);
        if (i > 1) console.log(`Prisma connected on attempt ${i}`);
        return;
      } catch (e) {
        await this.$disconnect().catch(() => {});
        if (i >= attempts) throw e;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
