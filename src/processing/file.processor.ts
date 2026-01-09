import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, ValidationError } from '@nestjs/common';
import { Job } from 'bullmq';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as ExcelJS from 'exceljs';
import { TASKS_QUEUE } from '../common/constants';
import { TasksService } from '../tasks/tasks.service';
import { TaskStatus } from '../tasks/schemas/task.schema';
import { ReservationsService } from '../reservations/reservations.service';
import { ReservationRowDto } from '../reservations/dto/reservation-row.dto';
import { ReportsService } from '../reports/reports.service';
import { RawReportError } from '../reports/raw-report-error.interface';
import { ReportErrorCode } from '../reports/report-error-code.enum';

export interface TaskJobData {
  taskId: string;
}

type CellValue = ExcelJS.CellValue;

@Processor(TASKS_QUEUE)
export class FileProcessor extends WorkerHost {
  private readonly logger = new Logger(FileProcessor.name);

  // Expected column headers (1-indexed for ExcelJS)
  private readonly COLUMN_MAP = {
    reservation_id: 1,
    guest_name: 2,
    status: 3,
    check_in_date: 4,
    check_out_date: 5,
  };

  constructor(
    private readonly tasksService: TasksService,
    private readonly reservationsService: ReservationsService,
    private readonly reportService: ReportsService,
  ) {
    super();
  }

  async process(job: Job<TaskJobData>): Promise<void> {
    const { taskId } = job.data;
    this.logger.log(`Processing task: ${taskId}`);

    const task = await this.tasksService.findById(taskId);
    if (!task) {
      this.logger.error(`Task ${taskId} not found`);
      return;
    }

    await this.tasksService.updateStatus(taskId, TaskStatus.IN_PROGRESS);

    const rawErrors: RawReportError[] = [];
    const seenReservationIds = new Set<string>();
    let processedRows = 0;

    try {
      const workbook = new ExcelJS.stream.xlsx.WorkbookReader(task.filePath, {
        worksheets: 'emit',
        entries: 'emit',
      });

      for await (const worksheet of workbook) {
        let header = true;

        for await (const row of worksheet) {
          // Skip header row
          if (header) {
            header = false;
            continue;
          }

          processedRows++;

          try {
            const dto = this.mapRowToDto(row);

            // Check for duplicates within the file
            if (
              dto.reservationId &&
              seenReservationIds.has(dto.reservationId)
            ) {
              rawErrors.push({
                row: row.number,
                code: ReportErrorCode.DUPLICATE,
                field: dto.reservationId,
              });
              // Emit progress even on errors
              this.tasksService.emitProgress(
                taskId,
                processedRows,
                rawErrors.length,
              );
              continue;
            }

            const validationErrors = await validate(dto);

            if (validationErrors.length > 0) {
              rawErrors.push(
                ...this.mapValidationErrors(row.number, validationErrors),
              );
              // Emit progress even on errors
              this.tasksService.emitProgress(
                taskId,
                processedRows,
                rawErrors.length,
              );
              continue;
            }

            // Track seen reservation IDs after validation passes
            seenReservationIds.add(dto.reservationId);

            // Process valid reservation
            await this.reservationsService.processReservation(dto);
          } catch (err) {
            rawErrors.push({
              row: row.number,
              code: ReportErrorCode.UNKNOWN,
              message: err instanceof Error ? err.message : 'Unknown error',
            });
          }

          // Emit progress update via WebSocket
          this.tasksService.emitProgress(
            taskId,
            processedRows,
            rawErrors.length,
          );
        }
      }

      this.logger.log(`Read ${processedRows} rows from file`);

      const report = await this.reportService.generateReport(taskId, rawErrors);

      await this.tasksService.completeTask(
        taskId,
        TaskStatus.COMPLETED,
        report.path,
      );

      this.logger.log(
        `Task ${taskId} completed. Processed ${processedRows} rows, ${rawErrors.length} errors`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';
      this.logger.error(`Task ${taskId} failed: ${message}`);

      const report = await this.reportService.generateReport(taskId, [
        {
          row: 0,
          code: ReportErrorCode.UNKNOWN,
          message: 'File processing failed',
        },
      ]);

      await this.tasksService.completeTask(
        taskId,
        TaskStatus.FAILED,
        report.path,
      );
    }
  }

  private mapRowToDto(row: ExcelJS.Row): ReservationRowDto {
    return plainToInstance(ReservationRowDto, {
      reservationId: this.normalizeValue(
        row.getCell(this.COLUMN_MAP.reservation_id).value,
      ),
      guestName: this.normalizeValue(
        row.getCell(this.COLUMN_MAP.guest_name).value,
      ),
      status: this.normalizeValue(row.getCell(this.COLUMN_MAP.status).value),
      checkInDate: this.normalizeDate(
        row.getCell(this.COLUMN_MAP.check_in_date).value,
      ),
      checkOutDate: this.normalizeDate(
        row.getCell(this.COLUMN_MAP.check_out_date).value,
      ),
    });
  }

  private normalizeValue(value: CellValue): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value instanceof Date) {
      return this.formatDate(value);
    }
    // Handle rich text
    if (typeof value === 'object' && 'richText' in value) {
      return value.richText.map((rt) => rt.text).join('');
    }
    return '';
  }

  private normalizeDate(value: CellValue): string {
    if (value === null || value === undefined) {
      return '';
    }

    // ExcelJS automatically converts Excel dates to JS Date objects
    if (value instanceof Date) {
      return this.formatDate(value);
    }

    // Handle string dates
    if (typeof value === 'string') {
      return value.trim();
    }

    // Handle numeric Excel dates (days since 1899-12-30)
    if (typeof value === 'number') {
      const date = this.excelDateToJSDate(value);
      return this.formatDate(date);
    }

    return '';
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private excelDateToJSDate(excelDate: number): Date {
    // Excel dates are days since 1899-12-30 (with a bug for 1900 leap year)
    const excelEpoch = new Date(1899, 11, 30);
    const msPerDay = 24 * 60 * 60 * 1000;
    return new Date(excelEpoch.getTime() + excelDate * msPerDay);
  }

  private mapValidationErrors(
    row: number,
    errors: ValidationError[],
  ): RawReportError[] {
    return errors.map((err) => ({
      row,
      code: this.mapConstraintToErrorCode(err),
      field: err.property,
    }));
  }

  private mapConstraintToErrorCode(error: ValidationError): ReportErrorCode {
    const constraints = Object.keys(error.constraints ?? {});

    if (constraints.includes('isEnum')) {
      return ReportErrorCode.INVALID_STATUS;
    }
    if (constraints.includes('isDateString')) {
      return ReportErrorCode.INVALID_DATE;
    }
    if (constraints.includes('isNotEmpty')) {
      return ReportErrorCode.MISSING_FIELD;
    }
    if (constraints.includes('isCheckOutAfterCheckIn')) {
      return ReportErrorCode.CHECKOUT_BEFORE_CHECKIN;
    }

    return ReportErrorCode.UNKNOWN;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<TaskJobData>, error: Error) {
    const { taskId } = job.data;
    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 1;

    if (attemptsMade < maxAttempts) {
      this.logger.warn(
        `Task ${taskId} failed (attempt ${attemptsMade}/${maxAttempts}), will retry: ${error.message}`,
      );
    } else {
      this.logger.error(
        `Task ${taskId} failed permanently after ${attemptsMade} attempts: ${error.message}`,
      );
    }
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`Worker error: ${error.message}`);
  }
}
