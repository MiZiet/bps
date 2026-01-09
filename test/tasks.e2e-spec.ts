import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { Server } from 'http';
import { join } from 'path';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { Connection } from 'mongoose';
import { setupTestDatabase, teardownTestDatabase } from './setup-e2e';
import { TasksController } from '../src/tasks/tasks.controller';
import { TasksService } from '../src/tasks/tasks.service';
import { TasksGateway } from '../src/tasks/tasks.gateway';
import { Task, TaskSchema } from '../src/tasks/schemas/task.schema';
import { ApiKeyGuard } from '../src/common/guards/api-key.guard';
import { TaskStatus } from '../src/tasks/schemas/task.schema';
import { TASKS_QUEUE } from '../src/common/constants';
import { ReportsService } from '../src/reports/reports.service';
import {
  UploadResponseDto,
  StatusResponseDto,
  ReportResponseDto,
  ReportErrorItemDto,
} from '../src/tasks/dto';

interface ErrorResponse {
  message: string;
  statusCode: number;
}

describe('TasksController (e2e)', () => {
  const testFilePath = join(__dirname, 'test-file.xlsx');
  const uploadsDir = join(__dirname, '..', 'uploads');
  let mongoUri: string;
  let app: INestApplication;
  let server: Server;
  let connection: Connection;
  let mockQueue: { add: jest.Mock };
  const validApiKey = 'test-api-key-123';

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoUri = await setupTestDatabase();

    // Ensure uploads directory exists
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }

    // Create a fake xlsx file for testing
    writeFileSync(testFilePath, 'fake xlsx content for testing');

    // Setup NestJS app - manually configure instead of importing TasksModule
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ API_KEY: validApiKey })],
        }),
        MongooseModule.forRoot(mongoUri),
        MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
      ],
      controllers: [TasksController],
      providers: [
        TasksService,
        {
          provide: getQueueToken(TASKS_QUEUE),
          useValue: mockQueue,
        },
        {
          provide: TasksGateway,
          useValue: {
            emitStatusUpdate: jest.fn(),
            emitProgressUpdate: jest.fn(),
          },
        },
        {
          provide: APP_GUARD,
          useClass: ApiKeyGuard,
        },
        ReportsService,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    connection = moduleFixture.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    if (connection) {
      await connection.dropDatabase();
    }
    if (app) {
      await app.close();
    }

    // Clean up test file
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }

    // Teardown MongoDB
    await teardownTestDatabase();
  });

  afterEach(async () => {
    if (connection) {
      const collections = connection.collections;
      for (const key in collections) {
        await collections[key].deleteMany({});
      }
    }
    jest.clearAllMocks();
  });

  describe('POST /tasks/upload', () => {
    it('should upload file, save to DB, and add to queue', async () => {
      const response = await request(server)
        .post('/tasks/upload')
        .set('x-api-key', validApiKey)
        .attach('file', testFilePath)
        .expect(201);

      const body = response.body as UploadResponseDto;

      expect(body.message).toBe('File uploaded successfully');
      expect(body.taskId).toBeDefined();
      expect(body.taskId).toHaveLength(24); // MongoDB ObjectId

      // Verify queue was called
      expect(mockQueue.add).toHaveBeenCalledWith('process-file', {
        taskId: body.taskId,
      });

      // Verify task exists in database
      const statusResponse = await request(server)
        .get(`/tasks/status/${body.taskId}`)
        .set('x-api-key', validApiKey)
        .expect(200);

      const status = statusResponse.body as StatusResponseDto;
      expect(status.status).toBe(TaskStatus.PENDING);
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

    it('should reject non-xlsx files', async () => {
      const txtFilePath = join(__dirname, 'test-file.txt');
      writeFileSync(txtFilePath, 'not an xlsx file');

      try {
        const response = await request(server)
          .post('/tasks/upload')
          .set('x-api-key', validApiKey)
          .attach('file', txtFilePath)
          .expect(400);

        const body = response.body as ErrorResponse;
        expect(body.message).toBe('Only .xlsx files are allowed');
      } finally {
        if (existsSync(txtFilePath)) {
          unlinkSync(txtFilePath);
        }
      }
    });
  });

  describe('GET /tasks/status/:taskId', () => {
    it('should return task status', async () => {
      const taskId = (
        await connection.collections['tasks'].insertOne({
          filePath: '/path/to/file.xlsx',
          status: TaskStatus.PENDING,
        })
      ).insertedId;

      // Get status
      const response = await request(server)
        .get(`/tasks/status/${taskId.toString()}`)
        .set('x-api-key', validApiKey)
        .expect(200);

      const body = response.body as StatusResponseDto;

      expect(body.taskId).toBe(taskId.toString());
      expect(body.status).toBe(TaskStatus.PENDING);
    });

    it('should reject status request without API key', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(server)
        .get(`/tasks/status/${fakeId}`)
        .expect(401);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe('Missing x-api-key header');
    });

    it('should return 404 for non-existent task', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(server)
        .get(`/tasks/status/${fakeId}`)
        .set('x-api-key', validApiKey)
        .expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(`Task with ID ${fakeId} not found`);
    });
  });

  describe('GET /tasks/report/:taskId', () => {
    const reportsDir = join(__dirname, '..', 'reports');
    let testReportPath: string;

    beforeAll(() => {
      if (!existsSync(reportsDir)) {
        mkdirSync(reportsDir, { recursive: true });
      }
    });

    afterEach(() => {
      if (testReportPath && existsSync(testReportPath)) {
        unlinkSync(testReportPath);
      }
    });

    it('should download task report when errors exist', async () => {
      const reportContent = [
        {
          row: 2,
          reason: 'Missing required field: guestName',
          suggestion: 'Provide value for field "guestName"',
        },
      ];
      testReportPath = join(reportsDir, 'test-report.json');
      writeFileSync(testReportPath, JSON.stringify(reportContent, null, 2));

      const taskId = (
        await connection.collections['tasks'].insertOne({
          filePath: '/path/to/file.xlsx',
          status: TaskStatus.FAILED,
          reportPath: testReportPath,
        })
      ).insertedId;

      const response = await request(server)
        .get(`/tasks/report/${taskId.toString()}`)
        .set('x-api-key', validApiKey)
        .expect(200);

      expect(response.headers['content-disposition']).toContain('attachment');
      const body = JSON.parse(response.text) as ReportErrorItemDto[];
      expect(body).toHaveLength(1);
      expect(body[0].row).toBe(2);
      expect(body[0].reason).toBe('Missing required field: guestName');
    });

    it('should return empty errors when no report exists', async () => {
      const taskId = (
        await connection.collections['tasks'].insertOne({
          filePath: '/path/to/file.xlsx',
          status: TaskStatus.COMPLETED,
          reportPath: '',
        })
      ).insertedId;

      const response = await request(server)
        .get(`/tasks/report/${taskId.toString()}`)
        .set('x-api-key', validApiKey)
        .expect(200);

      const body = response.body as ReportResponseDto;
      expect(body.message).toBe('No errors found during processing');
      expect(body.errors).toEqual([]);
    });

    it('should reject report request without API key', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(server)
        .get(`/tasks/report/${fakeId}`)
        .expect(401);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe('Missing x-api-key header');
    });

    it('should return 404 for non-existent task', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(server)
        .get(`/tasks/report/${fakeId}`)
        .set('x-api-key', validApiKey)
        .expect(404);

      const body = response.body as ErrorResponse;
      expect(body.message).toBe(`Task with ID ${fakeId} not found`);
    });
  });
});
