import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth';

// Mounts Better Auth: /api/auth/sign-in/google, /callback/google, /session, ...
@Controller()
export class AuthController {
  private handler = toNodeHandler(auth);

  @All('auth/{*path}')
  handle(@Req() req: Request, @Res() res: Response) {
    return this.handler(req, res);
  }
}
