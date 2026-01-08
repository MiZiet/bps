import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    findById: jest.fn(),
  };

  const mockReportPath = '/path/to/report.json';
  const mockDate = new Date();
  const mockTask = {
    _id: mockObjectId,
    status: TaskStatus.COMPLETED,
    createdAt: mockDate,
    updatedAt: mockDate,
    reportPath: mockReportPath,
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

  describe('getTaskStatus', () => {
    it('should return task status when task exists', async () => {
      mockTasksService.findById.mockResolvedValue(mockTask);

      const result = await controller.getTaskStatus(mockObjectId.toString());

      expect(result).toEqual({
        taskId: mockObjectId.toString(),
        status: TaskStatus.COMPLETED,
        createdAt: mockDate,
        updatedAt: mockDate,
        reportPath: mockReportPath,
      });

      expect(mockTasksService.findById).toHaveBeenCalledWith(
        mockObjectId.toString(),
      );
    });

    it('should throw NotFoundException when task does not exist', async () => {
      mockTasksService.findById.mockResolvedValue(null);

      await expect(controller.getTaskStatus('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.getTaskStatus('non-existent-id')).rejects.toThrow(
        'Task with ID non-existent-id not found',
      );
    });
  });

  describe('getTaskReport', () => {
    const mockResponse = {
      json: jest.fn().mockReturnThis(),
      download: jest.fn().mockReturnThis(),
    };

    it('should download report when reportPath exists', async () => {
      mockTasksService.findById.mockResolvedValue(mockTask);

      await controller.getTaskReport(
        mockObjectId.toString(),
        mockResponse as unknown as import('express').Response,
      );

      expect(mockResponse.download).toHaveBeenCalledWith(mockReportPath);
    });

    it('should return empty errors when no reportPath', async () => {
      const taskWithoutReport = {
        ...mockTask,
        reportPath: '',
      };
      mockTasksService.findById.mockResolvedValue(taskWithoutReport);

      await controller.getTaskReport(
        mockObjectId.toString(),
        mockResponse as unknown as import('express').Response,
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'No errors found during processing',
        errors: [],
      });
      expect(mockResponse.download).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when task does not exist', async () => {
      mockTasksService.findById.mockResolvedValue(null);

      await expect(
        controller.getTaskReport(
          'non-existent-id',
          mockResponse as unknown as import('express').Response,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
