import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let configService: ConfigService;

  const mockExecutionContext = (apiKey?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-api-key': apiKey,
          },
        }),
      }),
    }) as ExecutionContext;

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

    it('should allow request without x-api-key header', () => {
      const context = mockExecutionContext();
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow request with any x-api-key header', () => {
      const context = mockExecutionContext('any-key');
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when API_KEY is configured', () => {
    const validApiKey = 'my-secret-key';

    beforeEach(() => {
      jest.spyOn(configService, 'get').mockReturnValue(validApiKey);
    });

    it('should allow request with valid API key', () => {
      const context = mockExecutionContext(validApiKey);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw UnauthorizedException when x-api-key header is missing', () => {
      const context = mockExecutionContext();
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Missing x-api-key header',
      );
    });

    it('should throw UnauthorizedException when API key is invalid', () => {
      const context = mockExecutionContext('wrong-key');
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Invalid API key');
    });
  });
});
