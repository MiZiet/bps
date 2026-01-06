import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';
import { TasksController } from './tasks.controller';

describe('TasksController', () => {
  let controller: TasksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
    }).compile();

    controller = module.get<TasksController>(TasksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should return success response when file is uploaded', () => {
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

      const result = controller.uploadFile(mockFile);

      expect(result).toEqual({
        message: 'File uploaded successfully',
        filename: '1736171234567.xlsx',
        originalName: 'test.xlsx',
        size: 1024,
      });
    });

    it('should throw BadRequestException when no file is provided', () => {
      expect(() =>
        controller.uploadFile(undefined as unknown as Express.Multer.File),
      ).toThrow(BadRequestException);
      expect(() =>
        controller.uploadFile(undefined as unknown as Express.Multer.File),
      ).toThrow('No file provided');
    });

    it('should throw BadRequestException when file is null', () => {
      expect(() =>
        controller.uploadFile(null as unknown as Express.Multer.File),
      ).toThrow(BadRequestException);
    });
  });
});
