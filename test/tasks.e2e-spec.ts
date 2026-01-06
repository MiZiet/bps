import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { join } from 'path';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { TasksModule } from '../src/tasks/tasks.module';

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
  let app: INestApplication;
  let server: Server;
  const testFilePath = join(__dirname, 'test-file.xlsx');
  const uploadsDir = './uploads';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TasksModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;

    // Create a fake xlsx file for testing (just needs .xlsx extension)
    writeFileSync(testFilePath, 'fake xlsx content for testing');
  });

  afterAll(async () => {
    await app.close();

    // Clean up test file
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  describe('POST /tasks/upload', () => {
    it('should upload xlsx file successfully', async () => {
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
});
