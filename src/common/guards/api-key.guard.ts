import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Guard that validates API key from x-api-key header.
 *
 * Behavior:
 * - If API_KEY env is not set → authentication is disabled (all requests pass)
 * - If API_KEY env is set → requires valid x-api-key header
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const apiKey = this.configService.get<string>('API_KEY');

    // If no API_KEY configured, skip authentication
    if (!apiKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];

    if (!providedKey) {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    if (providedKey !== apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
