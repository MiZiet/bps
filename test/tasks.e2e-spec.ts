import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { Server } from 'http';
import { join } from 'path';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { Types } from 'mongoose';
import { TasksController } from '../src/tasks/tasks.controller';
import { TasksService } from '../src/tasks/tasks.service';
import { ApiKeyGuard } from '../src/common/guards/api-key.guard';
import { TaskStatus } from '../src/tasks/schemas/task.schema';

interface UploadResponse {
  message: string;
  taskId: string;
}

interface StatusResponse {
  taskId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  errorReport: Array<{ row: number; reason: string; suggestion: string }>;
}

interface ErrorResponse {
  message: string;
  statusCode: number;
}

describe('TasksController (e2e)', () => {
  const testFilePath = join(__dirname, 'test-file.xlsx');
  const mockObjectId = new Types.ObjectId();
  const mockDate = new Date();

  // Mock TasksService to avoid MongoDB dependency in tests
  const mockTasksService = {
    createTask: jest.fn().mockImplementation((filePath: string) => ({
      _id: mockObjectId,
      filePath,
      status: TaskStatus.PENDING,
      createdAt: mockDate,
      updatedAt: mockDate,
      errorReport: [],
    })),
    findById: jest.fn(),
  };

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
            load: [() => ({ API_KEY: undefined })],
          }),
        ],
        controllers: [TasksController],
        providers: [
          {
            provide: TasksService,
            useValue: mockTasksService,
          },
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

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should upload xlsx file and return taskId', async () => {
      const response = await request(server)
        .post('/tasks/upload')
        .attach('file', testFilePath)
        .expect(201);

      const body = response.body as UploadResponse;

      expect(body.message).toBe('File uploaded successfully');
      expect(body.taskId).toBe(mockObjectId.toString());
      expect(mockTasksService.createTask).toHaveBeenCalled();
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

    describe('GET /tasks/status/:taskId', () => {
      it('should return task status when task exists', async () => {
        mockTasksService.findById.mockResolvedValue({
          _id: mockObjectId,
          status: TaskStatus.PENDING,
          createdAt: mockDate,
          updatedAt: mockDate,
          errorReport: [],
        });

        const response = await request(server)
          .get(`/tasks/status/${mockObjectId.toString()}`)
          .expect(200);

        const body = response.body as StatusResponse;

        expect(body.taskId).toBe(mockObjectId.toString());
        expect(body.status).toBe(TaskStatus.PENDING);
        expect(body.errorReport).toEqual([]);
      });

      it('should return 404 when task does not exist', async () => {
        mockTasksService.findById.mockResolvedValue(null);

        const response = await request(server)
          .get('/tasks/status/non-existent-id')
          .expect(404);

        const body = response.body as ErrorResponse;

        expect(body.message).toBe('Task with ID non-existent-id not found');
      });
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
        ],
        controllers: [TasksController],
        providers: [
          {
            provide: TasksService,
            useValue: mockTasksService,
          },
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

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should upload file with valid API key and return taskId', async () => {
      const response = await request(server)
        .post('/tasks/upload')
        .set('x-api-key', validApiKey)
        .attach('file', testFilePath)
        .expect(201);

      const body = response.body as UploadResponse;

      expect(body.message).toBe('File uploaded successfully');
      expect(body.taskId).toBe(mockObjectId.toString());
    });

    it('should reject request without API key header', async () => {
      const response = await request(server).post('/tasks/upload').expect(401);

      const body = response.body as ErrorResponse;

      expect(body.message).toBe('Missing x-api-key header');
    });

    it('should reject request with invalid API key', async () => {
      const response = await request(server)
        .post('/tasks/upload')
        .set('x-api-key', 'wrong-key')
        .expect(401);

      const body = response.body as ErrorResponse;

      expect(body.message).toBe('Invalid API key');
    });

    describe('GET /tasks/status/:taskId', () => {
      it('should return task status with valid API key', async () => {
        mockTasksService.findById.mockResolvedValue({
          _id: mockObjectId,
          status: TaskStatus.COMPLETED,
          createdAt: mockDate,
          updatedAt: mockDate,
          errorReport: [],
        });

        const response = await request(server)
          .get(`/tasks/status/${mockObjectId.toString()}`)
          .set('x-api-key', validApiKey)
          .expect(200);

        const body = response.body as StatusResponse;

        expect(body.taskId).toBe(mockObjectId.toString());
        expect(body.status).toBe(TaskStatus.COMPLETED);
      });

      it('should return task with error report when failed', async () => {
        const errorReport = [
          {
            row: 2,
            reason: 'Invalid date format',
            suggestion: 'Use YYYY-MM-DD format',
          },
        ];

        mockTasksService.findById.mockResolvedValue({
          _id: mockObjectId,
          status: TaskStatus.FAILED,
          createdAt: mockDate,
          updatedAt: mockDate,
          errorReport,
        });

        const response = await request(server)
          .get(`/tasks/status/${mockObjectId.toString()}`)
          .set('x-api-key', validApiKey)
          .expect(200);

        const body = response.body as StatusResponse;

        expect(body.status).toBe(TaskStatus.FAILED);
        expect(body.errorReport).toHaveLength(1);
        expect(body.errorReport[0].row).toBe(2);
        expect(body.errorReport[0].reason).toBe('Invalid date format');
      });

      it('should reject status request without API key', async () => {
        const response = await request(server)
          .get(`/tasks/status/${mockObjectId.toString()}`)
          .expect(401);

        const body = response.body as ErrorResponse;

        expect(body.message).toBe('Missing x-api-key header');
      });
    });
  });
});
