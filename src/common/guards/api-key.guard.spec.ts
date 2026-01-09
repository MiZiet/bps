import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let configService: ConfigService;

  const mockHttpContext = (apiKey?: string): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-api-key': apiKey,
          },
        }),
      }),
    }) as ExecutionContext;

  const mockWsContext = (options?: {
    authApiKey?: string;
    queryApiKey?: string;
  }): ExecutionContext =>
    ({
      getType: () => 'ws',
      switchToWs: () => ({
        getClient: () => ({
          handshake: {
            auth: options?.authApiKey ? { apiKey: options.authApiKey } : {},
            query: options?.queryApiKey ? { apiKey: options.queryApiKey } : {},
          },
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('when API_KEY is not configured', () => {
    beforeEach(() => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);
    });

    it('should allow HTTP request without x-api-key header', () => {
      const context = mockHttpContext();
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow HTTP request with any x-api-key header', () => {
      const context = mockHttpContext('any-key');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow WebSocket connection without API key', () => {
      const context = mockWsContext();
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('HTTP requests when API_KEY is configured', () => {
    const validApiKey = 'my-secret-key';

    beforeEach(() => {
      jest.spyOn(configService, 'get').mockReturnValue(validApiKey);
    });

    it('should allow request with valid API key', () => {
      const context = mockHttpContext(validApiKey);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw UnauthorizedException when x-api-key header is missing', () => {
      const context = mockHttpContext();
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Missing x-api-key header',
      );
    });

    it('should throw UnauthorizedException when API key is invalid', () => {
      const context = mockHttpContext('wrong-key');
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Invalid API key');
    });
  });

  describe('WebSocket connections when API_KEY is configured', () => {
    const validApiKey = 'my-secret-key';

    beforeEach(() => {
      jest.spyOn(configService, 'get').mockReturnValue(validApiKey);
    });

    it('should allow connection with valid API key in handshake auth', () => {
      const context = mockWsContext({ authApiKey: validApiKey });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow connection with valid API key in query params', () => {
      const context = mockWsContext({ queryApiKey: validApiKey });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should prefer auth over query when both provided', () => {
      const context = mockWsContext({
        authApiKey: validApiKey,
        queryApiKey: 'wrong-key',
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw UnauthorizedException when API key is missing', () => {
      const context = mockWsContext();
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Missing API key in WebSocket handshake',
      );
    });

    it('should throw UnauthorizedException when API key is invalid', () => {
      const context = mockWsContext({ authApiKey: 'wrong-key' });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Invalid API key');
    });
  });
});
