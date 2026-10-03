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
  // Origins are env-driven so the same build runs on localhost and on a
  // VPS domain: set WEB_URL (web app) and BETTER_AUTH_URL (this API).
  const port = Number(process.env.API_PORT ?? 4000);
  const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
  const apiUrl = process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`;
  app.enableCors({
    origin: [webUrl, apiUrl],
    credentials: true,
  });
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Remy API listening on http://localhost:${port}/api`);
}
bootstrap();
