import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Socket, Server } from 'socket.io';
import {
  TasksGateway,
  TaskStatusUpdate,
  TaskProgressUpdate,
} from './tasks.gateway';
import { TaskStatus } from './schemas/task.schema';

describe('TasksGateway', () => {
  let gateway: TasksGateway;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  const mockSocket = {
    id: 'test-socket-id',
    join: jest.fn(),
    leave: jest.fn(),
    handshake: {
      auth: { apiKey: 'test-api-key' },
      query: {},
    },
  } as unknown as Socket;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksGateway,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    gateway = module.get<TasksGateway>(TasksGateway);
    gateway.server = mockServer as unknown as Server;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should log client connection', () => {
      // Just verify it doesn't throw
      expect(() => gateway.handleConnection(mockSocket)).not.toThrow();
    });
  });

  describe('handleDisconnect', () => {
    it('should log client disconnection', () => {
      // Just verify it doesn't throw
      expect(() => gateway.handleDisconnect(mockSocket)).not.toThrow();
    });
  });

  describe('handleSubscribe', () => {
    it('should join client to task room and return subscribed event', () => {
      const taskId = 'task-123';

      const result = gateway.handleSubscribe(mockSocket, { taskId });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockSocket.join).toHaveBeenCalledWith(`task:${taskId}`);
      expect(result).toEqual({
        event: 'subscribed',
        data: { taskId },
      });
    });
  });

  describe('handleUnsubscribe', () => {
    it('should leave client from task room and return unsubscribed event', () => {
      const taskId = 'task-123';

      const result = gateway.handleUnsubscribe(mockSocket, { taskId });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockSocket.leave).toHaveBeenCalledWith(`task:${taskId}`);
      expect(result).toEqual({
        event: 'unsubscribed',
        data: { taskId },
      });
    });
  });

  describe('emitStatusUpdate', () => {
    it('should emit status update to the task room', () => {
      const update: TaskStatusUpdate = {
        taskId: 'task-123',
        status: TaskStatus.COMPLETED,
        timestamp: new Date(),
      };

      gateway.emitStatusUpdate(update);

      expect(mockServer.to).toHaveBeenCalledWith('task:task-123');
      expect(mockServer.emit).toHaveBeenCalledWith('status', update);
    });

    it('should include reportPath in status update when provided', () => {
      const update: TaskStatusUpdate = {
        taskId: 'task-123',
        status: TaskStatus.COMPLETED,
        timestamp: new Date(),
        reportPath: '/reports/task-123.json',
      };

      gateway.emitStatusUpdate(update);

      expect(mockServer.emit).toHaveBeenCalledWith('status', update);
    });
  });

  describe('emitProgressUpdate', () => {
    it('should emit progress update to the task room', () => {
      const update: TaskProgressUpdate = {
        taskId: 'task-123',
        processedRows: 100,
        errorCount: 5,
        timestamp: new Date(),
      };

      gateway.emitProgressUpdate(update);

      expect(mockServer.to).toHaveBeenCalledWith('task:task-123');
      expect(mockServer.emit).toHaveBeenCalledWith('progress', update);
    });
  });
});
