import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';
import { ReportsService } from './reports.service';
import { ReportErrorCode } from './report-error-code.enum';
import { RawReportError } from './raw-report-error.interface';

jest.mock('fs/promises');

describe('ReportsService', () => {
  let service: ReportsService;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateReport', () => {
    it('should return empty path and items when no errors', async () => {
      const result = await service.generateReport('task-123', []);

      expect(result).toEqual({ path: '', items: [] });
      expect(mockFs.mkdir).not.toHaveBeenCalled();
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should generate report file with mapped errors', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const rawErrors: RawReportError[] = [
        { row: 2, code: ReportErrorCode.MISSING_FIELD, field: 'guestName' },
        { row: 3, code: ReportErrorCode.INVALID_DATE, field: 'checkInDate' },
      ];

      const result = await service.generateReport('task-456', rawErrors);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('reports'),
        { recursive: true },
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('task-456-report.json'),
        expect.any(String),
        'utf-8',
      );

      expect(result.path).toContain('task-456-report.json');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        row: 2,
        reason: 'Missing required field: guestName',
        suggestion: 'Provide value for field "guestName"',
      });
      expect(result.items[1]).toEqual({
        row: 3,
        reason: 'Invalid date format in field: checkInDate',
        suggestion: 'Use YYYY-MM-DD format',
      });
    });

    it('should map INVALID_STATUS error correctly', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const rawErrors: RawReportError[] = [
        { row: 5, code: ReportErrorCode.INVALID_STATUS },
      ];

      const result = await service.generateReport('task-789', rawErrors);

      expect(result.items[0]).toEqual({
        row: 5,
        reason: 'Invalid reservation status',
        suggestion:
          'Use one of allowed values: oczekująca, zrealizowana, anulowana',
      });
    });

    it('should map CHECKOUT_BEFORE_CHECKIN error correctly', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const rawErrors: RawReportError[] = [
        { row: 7, code: ReportErrorCode.CHECKOUT_BEFORE_CHECKIN },
      ];

      const result = await service.generateReport('task-abc', rawErrors);

      expect(result.items[0]).toEqual({
        row: 7,
        reason: 'Check-out date is before check-in date',
        suggestion: 'Ensure check-out date is after check-in date',
      });
    });

    it('should map DUPLICATE error correctly', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const rawErrors: RawReportError[] = [
        { row: 10, code: ReportErrorCode.DUPLICATE, field: 'RES-123' },
      ];

      const result = await service.generateReport('task-def', rawErrors);

      expect(result.items[0]).toEqual({
        row: 10,
        reason: 'Duplicate reservation ID: RES-123',
        suggestion: 'Remove duplicate entry or use unique reservation ID',
      });
    });

    it('should map UNKNOWN error with message correctly', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const rawErrors: RawReportError[] = [
        { row: 15, code: ReportErrorCode.UNKNOWN, message: 'Database error' },
      ];

      const result = await service.generateReport('task-ghi', rawErrors);

      expect(result.items[0]).toEqual({
        row: 15,
        reason: 'Database error',
        suggestion: 'Verify row data',
      });
    });

    it('should handle UNKNOWN error without message', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const rawErrors: RawReportError[] = [
        { row: 20, code: ReportErrorCode.UNKNOWN },
      ];

      const result = await service.generateReport('task-jkl', rawErrors);

      expect(result.items[0]).toEqual({
        row: 20,
        reason: 'Unknown error',
        suggestion: 'Verify row data',
      });
    });
  });
});
