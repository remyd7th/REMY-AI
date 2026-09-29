import { NestFactory } from '@nestjs/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppModule } from './app.module';

// Root .env must load before any module reads process.env at import time
// (e.g. auth.ts provider setup). ConfigModule re-loads it harmlessly later.
const rootEnv = path.join(process.cwd(), '..', '..', '.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_URL ?? 'http://localhost:3000' });
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Remy API listening on http://localhost:${port}/api`);
}
bootstrap();
