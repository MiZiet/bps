import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Socket } from 'socket.io';

/**
 * Guard that validates API key from x-api-key header (HTTP) or handshake auth (WebSocket).
 *
 * Behavior:
 * - If API_KEY env is not set → authentication is disabled (all requests pass)
 * - If API_KEY env is set → requires valid API key
 *
 * For HTTP: x-api-key header
 * For WebSocket: auth.apiKey in handshake or apiKey query param
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

    const contextType = context.getType();

    if (contextType === 'ws') {
      return this.validateWebSocket(context, apiKey);
    }

    return this.validateHttp(context, apiKey);
  }

  private validateHttp(context: ExecutionContext, apiKey: string): boolean {
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

  private validateWebSocket(
    context: ExecutionContext,
    apiKey: string,
  ): boolean {
    const client = context.switchToWs().getClient<Socket>();

    // Try to get API key from handshake auth or query params
    const providedKey: string | undefined =
      (client.handshake.auth?.apiKey as string | undefined) ||
      (client.handshake.query?.apiKey as string | undefined);

    if (!providedKey) {
      throw new UnauthorizedException('Missing API key in WebSocket handshake');
    }

    if (providedKey !== apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
