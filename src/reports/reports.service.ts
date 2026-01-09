import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export enum ReportErrorCode {
  MISSING_FIELD = 'MISSING_FIELD',
  INVALID_DATE = 'INVALID_DATE',
  INVALID_STATUS = 'INVALID_STATUS',
  CHECKOUT_BEFORE_CHECKIN = 'CHECKOUT_BEFORE_CHECKIN',
  DUPLICATE = 'DUPLICATE',
  UNKNOWN = 'UNKNOWN',
}

export interface RawReportError {
  row: number;
  code: ReportErrorCode;
  field?: string;
  message?: string;
}

interface ErrorReportItem {
  row: number;
  reason: string;
  suggestion: string;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly reportsDir = path.resolve(process.cwd(), 'reports');

  async generateReport(
    taskId: string,
    rawErrors: RawReportError[],
  ): Promise<{ path: string; items: ErrorReportItem[] }> {
    if (rawErrors.length === 0) {
      return { path: '', items: [] };
    }

    await fs.mkdir(this.reportsDir, { recursive: true });

    const items = rawErrors.map((err) => this.mapError(err));
    const filePath = path.join(this.reportsDir, `${taskId}-report.json`);

    await fs.writeFile(filePath, JSON.stringify(items, null, 2), 'utf-8');

    this.logger.log(`Error report generated for task ${taskId}`);

    return {
      path: filePath,
      items,
    };
  }

  private mapError(error: RawReportError): ErrorReportItem {
    switch (error.code) {
      case ReportErrorCode.MISSING_FIELD:
        return {
          row: error.row,
          reason: `Missing required field: ${error.field}`,
          suggestion: `Provide value for field "${error.field}"`,
        };

      case ReportErrorCode.INVALID_DATE:
        return {
          row: error.row,
          reason: `Invalid date format in field: ${error.field}`,
          suggestion: 'Use YYYY-MM-DD format',
        };

      case ReportErrorCode.INVALID_STATUS:
        return {
          row: error.row,
          reason: 'Invalid reservation status',
          suggestion:
            'Use one of allowed values: oczekująca, zrealizowana, anulowana',
        };

      case ReportErrorCode.CHECKOUT_BEFORE_CHECKIN:
        return {
          row: error.row,
          reason: 'Check-out date is before check-in date',
          suggestion: 'Ensure check-out date is after check-in date',
        };

      case ReportErrorCode.DUPLICATE:
        return {
          row: error.row,
          reason: `Duplicate reservation ID: ${error.field}`,
          suggestion: 'Remove duplicate entry or use unique reservation ID',
        };

      default:
        return {
          row: error.row,
          reason: error.message ?? 'Unknown error',
          suggestion: 'Verify row data',
        };
    }
  }
}
