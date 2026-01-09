import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { FileProcessor, TaskJobData } from './file.processor';
import { TasksService } from '../tasks/tasks.service';
import { ReservationsService } from '../reservations/reservations.service';
import { ReportsService, ReportErrorCode } from '../reports/reports.service';
import { TaskStatus } from '../tasks/schemas/task.schema';

// Mock ExcelJS
jest.mock('exceljs', () => ({
  stream: {
    xlsx: {
      WorkbookReader: jest.fn(),
    },
  },
}));

import * as ExcelJS from 'exceljs';

describe('FileProcessor', () => {
  let processor: FileProcessor;

  const mockTasksService = {
    findById: jest.fn(),
    updateStatus: jest.fn(),
    completeTask: jest.fn(),
    emitProgress: jest.fn(),
  };

  const mockReservationsService = {
    processReservation: jest.fn(),
  };

  const mockReportsService = {
    generateReport: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileProcessor,
        { provide: TasksService, useValue: mockTasksService },
        { provide: ReservationsService, useValue: mockReservationsService },
        { provide: ReportsService, useValue: mockReportsService },
      ],
    }).compile();

    processor = module.get<FileProcessor>(FileProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    const createMockJob = (taskId: string): Job<TaskJobData> =>
      ({
        data: { taskId },
      }) as Job<TaskJobData>;

    it('should return early if task not found', async () => {
      mockTasksService.findById.mockResolvedValue(null);

      await processor.process(createMockJob('non-existent'));

      expect(mockTasksService.findById).toHaveBeenCalledWith('non-existent');
      expect(mockTasksService.updateStatus).not.toHaveBeenCalled();
    });

    it('should update status to IN_PROGRESS when processing starts', async () => {
      const mockTask = { _id: 'task-123', filePath: '/test/file.xlsx' };
      mockTasksService.findById.mockResolvedValue(mockTask);
      mockReportsService.generateReport.mockResolvedValue({
        path: '/reports/task-123-report.json',
        items: [],
      });

      // Mock ExcelJS to return empty workbook
      const mockWorkbookReader = {
        [Symbol.asyncIterator]: function* () {
          yield {
            [Symbol.asyncIterator]: function* () {
              // Empty worksheet
            },
          };
        },
      };
      (ExcelJS.stream.xlsx.WorkbookReader as jest.Mock).mockReturnValue(
        mockWorkbookReader,
      );

      await processor.process(createMockJob('task-123'));

      expect(mockTasksService.updateStatus).toHaveBeenCalledWith(
        'task-123',
        TaskStatus.IN_PROGRESS,
      );
    });

    it('should process valid rows and call reservationsService', async () => {
      const mockTask = { _id: 'task-123', filePath: '/test/file.xlsx' };
      mockTasksService.findById.mockResolvedValue(mockTask);
      mockReservationsService.processReservation.mockResolvedValue(true);
      mockReportsService.generateReport.mockResolvedValue({
        path: '',
        items: [],
      });

      // Mock row with valid data
      const mockRow = {
        number: 2,
        getCell: jest.fn((col: number) => {
          const values: Record<number, { value: string }> = {
            1: { value: '12345' },
            2: { value: 'Jan Nowak' },
            3: { value: 'oczekująca' },
            4: { value: '2024-05-01' },
            5: { value: '2024-05-07' },
          };
          return values[col] || { value: '' };
        }),
      };

      const mockWorkbookReader = {
        [Symbol.asyncIterator]: function* () {
          yield {
            [Symbol.asyncIterator]: function* () {
              // Header row
              yield {
                number: 1,
                getCell: jest.fn(() => ({ value: 'header' })),
              };
              // Data row
              yield mockRow;
            },
          };
        },
      };
      (ExcelJS.stream.xlsx.WorkbookReader as jest.Mock).mockReturnValue(
        mockWorkbookReader,
      );

      await processor.process(createMockJob('task-123'));

      expect(mockReservationsService.processReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: '12345',
          guestName: 'Jan Nowak',
          status: 'oczekująca',
          checkInDate: '2024-05-01',
          checkOutDate: '2024-05-07',
        }),
      );
      expect(mockTasksService.completeTask).toHaveBeenCalledWith(
        'task-123',
        TaskStatus.COMPLETED,
        '',
      );
    });

    it('should detect duplicate reservation IDs within file', async () => {
      const mockTask = { _id: 'task-123', filePath: '/test/file.xlsx' };
      mockTasksService.findById.mockResolvedValue(mockTask);
      mockReservationsService.processReservation.mockResolvedValue(true);
      mockReportsService.generateReport.mockResolvedValue({
        path: '/reports/task-123-report.json',
        items: [],
      });

      // Create rows with duplicate reservation ID
      const createMockRow = (rowNum: number, resId: string) => ({
        number: rowNum,
        getCell: jest.fn((col: number) => {
          const values: Record<number, { value: string }> = {
            1: { value: resId },
            2: { value: 'Guest Name' },
            3: { value: 'oczekująca' },
            4: { value: '2024-05-01' },
            5: { value: '2024-05-07' },
          };
          return values[col] || { value: '' };
        }),
      });

      const mockWorkbookReader = {
        [Symbol.asyncIterator]: function* () {
          yield {
            [Symbol.asyncIterator]: function* () {
              yield {
                number: 1,
                getCell: jest.fn(() => ({ value: 'header' })),
              };
              yield createMockRow(2, 'SAME-ID');
              yield createMockRow(3, 'SAME-ID'); // Duplicate
            },
          };
        },
      };
      (ExcelJS.stream.xlsx.WorkbookReader as jest.Mock).mockReturnValue(
        mockWorkbookReader,
      );

      await processor.process(createMockJob('task-123'));

      // First row should be processed
      expect(mockReservationsService.processReservation).toHaveBeenCalledTimes(
        1,
      );

      // Report should include duplicate error
      expect(mockReportsService.generateReport).toHaveBeenCalledWith(
        'task-123',
        expect.arrayContaining([
          expect.objectContaining({
            row: 3,
            code: ReportErrorCode.DUPLICATE,
            field: 'SAME-ID',
          }),
        ]),
      );
    });

    it('should report validation errors for invalid rows', async () => {
      const mockTask = { _id: 'task-123', filePath: '/test/file.xlsx' };
      mockTasksService.findById.mockResolvedValue(mockTask);
      mockReportsService.generateReport.mockResolvedValue({
        path: '/reports/task-123-report.json',
        items: [],
      });

      // Mock row with missing required field
      const mockRow = {
        number: 2,
        getCell: jest.fn((col: number) => {
          const values: Record<number, { value: string }> = {
            1: { value: '12345' },
            2: { value: '' }, // Missing guest name
            3: { value: 'oczekująca' },
            4: { value: '2024-05-01' },
            5: { value: '2024-05-07' },
          };
          return values[col] || { value: '' };
        }),
      };

      const mockWorkbookReader = {
        [Symbol.asyncIterator]: function* () {
          yield {
            [Symbol.asyncIterator]: function* () {
              yield {
                number: 1,
                getCell: jest.fn(() => ({ value: 'header' })),
              };
              yield mockRow;
            },
          };
        },
      };
      (ExcelJS.stream.xlsx.WorkbookReader as jest.Mock).mockReturnValue(
        mockWorkbookReader,
      );

      await processor.process(createMockJob('task-123'));

      // Should not process invalid row
      expect(mockReservationsService.processReservation).not.toHaveBeenCalled();

      // Should report validation error
      expect(mockReportsService.generateReport).toHaveBeenCalledWith(
        'task-123',
        expect.arrayContaining([
          expect.objectContaining({
            row: 2,
            code: ReportErrorCode.MISSING_FIELD,
            field: 'guestName',
          }),
        ]),
      );
    });

    it('should handle file processing errors and mark task as FAILED', async () => {
      const mockTask = { _id: 'task-123', filePath: '/test/file.xlsx' };
      mockTasksService.findById.mockResolvedValue(mockTask);
      mockReportsService.generateReport.mockResolvedValue({
        path: '/reports/task-123-report.json',
        items: [],
      });

      // Mock ExcelJS to throw error
      (ExcelJS.stream.xlsx.WorkbookReader as jest.Mock).mockImplementation(
        () => {
          throw new Error('File corrupted');
        },
      );

      await processor.process(createMockJob('task-123'));

      expect(mockTasksService.completeTask).toHaveBeenCalledWith(
        'task-123',
        TaskStatus.FAILED,
        '/reports/task-123-report.json',
      );

      expect(mockReportsService.generateReport).toHaveBeenCalledWith(
        'task-123',
        expect.arrayContaining([
          expect.objectContaining({
            row: 0,
            code: ReportErrorCode.UNKNOWN,
            message: 'File processing failed',
          }),
        ]),
      );
    });

    it('should handle Date objects from Excel cells', async () => {
      const mockTask = { _id: 'task-123', filePath: '/test/file.xlsx' };
      mockTasksService.findById.mockResolvedValue(mockTask);
      mockReservationsService.processReservation.mockResolvedValue(true);
      mockReportsService.generateReport.mockResolvedValue({
        path: '',
        items: [],
      });

      // Mock row with Date objects (as ExcelJS returns)
      const mockRow = {
        number: 2,
        getCell: jest.fn((col: number) => {
          const values: Record<number, { value: string | Date }> = {
            1: { value: '12345' },
            2: { value: 'Jan Nowak' },
            3: { value: 'oczekująca' },
            4: { value: new Date('2024-05-01') },
            5: { value: new Date('2024-05-07') },
          };
          return values[col] || { value: '' };
        }),
      };

      const mockWorkbookReader = {
        [Symbol.asyncIterator]: function* () {
          yield {
            [Symbol.asyncIterator]: function* () {
              yield {
                number: 1,
                getCell: jest.fn(() => ({ value: 'header' })),
              };
              yield mockRow;
            },
          };
        },
      };
      (ExcelJS.stream.xlsx.WorkbookReader as jest.Mock).mockReturnValue(
        mockWorkbookReader,
      );

      await processor.process(createMockJob('task-123'));

      expect(mockReservationsService.processReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          checkInDate: '2024-05-01',
          checkOutDate: '2024-05-07',
        }),
      );
    });

    it('should handle numeric Excel dates', async () => {
      const mockTask = { _id: 'task-123', filePath: '/test/file.xlsx' };
      mockTasksService.findById.mockResolvedValue(mockTask);
      mockReservationsService.processReservation.mockResolvedValue(true);
      mockReportsService.generateReport.mockResolvedValue({
        path: '',
        items: [],
      });

      // Excel date 45413 = 2024-05-01 (days since 1899-12-30)
      const mockRow = {
        number: 2,
        getCell: jest.fn((col: number) => {
          const values: Record<number, { value: string | number }> = {
            1: { value: '12345' },
            2: { value: 'Jan Nowak' },
            3: { value: 'oczekująca' },
            4: { value: 45413 }, // Numeric Excel date
            5: { value: 45419 },
          };
          return values[col] || { value: '' };
        }),
      };

      const mockWorkbookReader = {
        [Symbol.asyncIterator]: function* () {
          yield {
            [Symbol.asyncIterator]: function* () {
              yield {
                number: 1,
                getCell: jest.fn(() => ({ value: 'header' })),
              };
              yield mockRow;
            },
          };
        },
      };
      (ExcelJS.stream.xlsx.WorkbookReader as jest.Mock).mockReturnValue(
        mockWorkbookReader,
      );

      await processor.process(createMockJob('task-123'));

      expect(mockReservationsService.processReservation).toHaveBeenCalled();
    });
  });
});
