import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';
import { Types } from 'mongoose';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskStatus } from './schemas/task.schema';

describe('TasksController', () => {
  let controller: TasksController;

  const mockObjectId = new Types.ObjectId();

  const mockTasksService = {
    createTask: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should return taskId when file is uploaded', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.xlsx',
        encoding: '7bit',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 1024,
        destination: './uploads',
        filename: '1736171234567.xlsx',
        path: './uploads/1736171234567.xlsx',
        buffer: Buffer.from([]),
        stream: Readable.from([]),
      };

      const mockTask = {
        _id: mockObjectId,
        filePath: mockFile.path,
        status: TaskStatus.PENDING,
      };

      mockTasksService.createTask.mockResolvedValue(mockTask);

      const result = await controller.uploadFile(mockFile);

      expect(result).toEqual({
        message: 'File uploaded successfully',
        taskId: mockObjectId.toString(),
      });
      expect(mockTasksService.createTask).toHaveBeenCalledWith(mockFile.path);
    });

    it('should throw BadRequestException when no file is provided', async () => {
      await expect(
        controller.uploadFile(undefined as unknown as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.uploadFile(undefined as unknown as Express.Multer.File),
      ).rejects.toThrow('No file provided');
    });

    it('should throw BadRequestException when file is null', async () => {
      await expect(
        controller.uploadFile(null as unknown as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
