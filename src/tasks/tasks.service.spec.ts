import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { Types } from 'mongoose';
import { TasksService } from './tasks.service';
import { Task, TaskStatus } from './schemas/task.schema';
import { TASKS_QUEUE } from '../common/constants';

describe('TasksService', () => {
  let service: TasksService;

  const mockObjectId = new Types.ObjectId();

  const mockTask = {
    _id: mockObjectId,
    filePath: './uploads/test.xlsx',
    status: TaskStatus.PENDING,
    save: jest.fn().mockResolvedValue({
      _id: mockObjectId,
      filePath: './uploads/test.xlsx',
      status: TaskStatus.PENDING,
    }),
  };

  const mockTaskModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  // Mock constructor function
  const MockTaskModel = jest.fn().mockImplementation(() => mockTask);
  Object.assign(MockTaskModel, mockTaskModel);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getModelToken(Task.name),
          useValue: MockTaskModel,
        },
        {
          provide: getQueueToken(TASKS_QUEUE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTask', () => {
    it('should create a task with PENDING status and add to queue', async () => {
      const filePath = './uploads/test.xlsx';

      const result = await service.createTask(filePath);

      expect(result.filePath).toBe(filePath);
      expect(result.status).toBe(TaskStatus.PENDING);
      expect(result._id).toBeDefined();
      expect(mockTask.save).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith('process-file', {
        taskId: mockObjectId.toString(),
      });
    });
  });

  describe('findById', () => {
    it('should return task when found', async () => {
      const expectedTask = {
        _id: mockObjectId,
        filePath: './uploads/test.xlsx',
        status: TaskStatus.PENDING,
      };

      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(expectedTask),
      });

      const result = await service.findById(mockObjectId.toString());

      expect(result).toEqual(expectedTask);
      expect(mockTaskModel.findById).toHaveBeenCalledWith(
        mockObjectId.toString(),
      );
    });

    it('should return null when task not found', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update task status', async () => {
      const updatedTask = {
        _id: mockObjectId,
        status: TaskStatus.COMPLETED,
      };

      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedTask),
      });

      const result = await service.updateStatus(
        mockObjectId.toString(),
        TaskStatus.COMPLETED,
      );

      expect(result?.status).toBe(TaskStatus.COMPLETED);
      expect(mockTaskModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockObjectId.toString(),
        { status: TaskStatus.COMPLETED },
        { new: true },
      );
    });
  });
});
