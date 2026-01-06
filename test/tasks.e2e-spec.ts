import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { Server } from 'http';
import { join } from 'path';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { TasksModule } from '../src/tasks/tasks.module';
import { ApiKeyGuard } from '../src/common/guards/api-key.guard';

interface UploadResponse {
  message: string;
  filename: string;
  originalName: string;
  size: number;
}

interface ErrorResponse {
  message: string;
  statusCode: number;
}

describe('TasksController (e2e)', () => {
  const testFilePath = join(__dirname, 'test-file.xlsx');
  const uploadsDir = './uploads';

  beforeAll(() => {
    // Create a fake xlsx file for testing (just needs .xlsx extension)
    writeFileSync(testFilePath, 'fake xlsx content for testing');
  });

  afterAll(() => {
    // Clean up test file
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  describe('without API key configured', () => {
    let app: INestApplication;
    let server: Server;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            // No API_KEY set = auth disabled
            load: [() => ({ API_KEY: undefined })],
          }),
          TasksModule,
        ],
        providers: [
          {
            provide: APP_GUARD,
            useClass: ApiKeyGuard,
          },
        ],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
      server = app.getHttpServer() as Server;
    });

    afterAll(async () => {
      await app.close();
    });

    it('should upload xlsx file successfully without API key', async () => {
      const response = await request(server)
        .post('/tasks/upload')
        .attach('file', testFilePath)
        .expect(201);

      const body = response.body as UploadResponse;

      expect(body).toMatchObject({
        message: 'File uploaded successfully',
        originalName: 'test-file.xlsx',
      });
      expect(body.filename).toBeDefined();
      expect(body.size).toBeGreaterThan(0);

      // Clean up uploaded file
      const uploadedPath = join(uploadsDir, body.filename);
      if (existsSync(uploadedPath)) {
        unlinkSync(uploadedPath);
      }
    });

    it('should reject non-xlsx files', async () => {
      const txtFilePath = join(__dirname, 'test.txt');
      writeFileSync(txtFilePath, 'text content');

      try {
        await request(server)
          .post('/tasks/upload')
          .attach('file', txtFilePath)
          .expect(400);
      } finally {
        if (existsSync(txtFilePath)) {
          unlinkSync(txtFilePath);
        }
      }
    });

    it('should reject request without file', async () => {
      const response = await request(server).post('/tasks/upload').expect(400);

      const body = response.body as ErrorResponse;

      expect(body.message).toBe('No file provided');
    });
  });

  describe('with API key configured', () => {
    let app: INestApplication;
    let server: Server;
    const validApiKey = 'test-api-key-123';

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [() => ({ API_KEY: validApiKey })],
          }),
          TasksModule,
        ],
        providers: [
          {
            provide: APP_GUARD,
            useClass: ApiKeyGuard,
          },
        ],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
      server = app.getHttpServer() as Server;
    });

    afterAll(async () => {
      await app.close();
    });

    it('should upload file with valid API key', async () => {
      const response = await request(server)
        .post('/tasks/upload')
        .set('x-api-key', validApiKey)
        .attach('file', testFilePath)
        .expect(201);

      const body = response.body as UploadResponse;

      expect(body.message).toBe('File uploaded successfully');

      // Clean up uploaded file
      const uploadedPath = join(uploadsDir, body.filename);
      if (existsSync(uploadedPath)) {
        unlinkSync(uploadedPath);
      }
    });

    it('should reject request without API key header', async () => {
      const response = await request(server)
        .post('/tasks/upload')
        .attach('file', testFilePath)
        .expect(401);

      const body = response.body as ErrorResponse;

      expect(body.message).toBe('Missing x-api-key header');
    });

    it('should reject request with invalid API key', async () => {
      const response = await request(server)
        .post('/tasks/upload')
        .set('x-api-key', 'wrong-key')
        .attach('file', testFilePath)
        .expect(401);

      const body = response.body as ErrorResponse;

      expect(body.message).toBe('Invalid API key');
    });
  });
});
