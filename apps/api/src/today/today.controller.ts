import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// GET /api/today — stub aggregator; real panels land in Phase 5 slices.
@Controller('today')
export class TodayController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getToday() {
    return {
      tasks: [],
      meetings: [],
      emails: [],
      followups: [],
      docs: [],
      progress: { done: 0, remaining: 0 },
      note: 'Phase 4 stub — panels wired in Phase 5',
    };
  }
}
