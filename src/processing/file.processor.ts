import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as ExcelJS from 'exceljs';
import { TASKS_QUEUE } from '../common/constants';
import { TasksService } from '../tasks/tasks.service';
import { TaskStatus, ErrorReportItem } from '../tasks/schemas/task.schema';
import { ReservationsService } from '../reservations/reservations.service';
import { ReservationRowDto } from '../reservations/dto/reservation-row.dto';

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

    const errorReport: ErrorReportItem[] = [];
    let processedRows = 0;

    try {
      const workbook = new ExcelJS.stream.xlsx.WorkbookReader(task.filePath, {
        worksheets: 'emit',
        entries: 'emit',
      });

      for await (const worksheet of workbook) {
        let isFirstRow = true;

        for await (const row of worksheet) {
          // Skip header row
          if (isFirstRow) {
            isFirstRow = false;
            continue;
          }

          processedRows++;
          const rowNumber = row.number;

          try {
            const dto = this.mapRowToDto(row);

            // Validate DTO
            const validationErrors = await this.validateDto(dto);
            if (validationErrors.length > 0) {
              errorReport.push({
                row: rowNumber,
                reason: validationErrors.join('; '),
                suggestion: this.getSuggestionForErrors(validationErrors),
              });
              continue;
            }

            // Process valid reservation
            await this.reservationsService.processReservation(dto);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Unknown error';
            errorReport.push({
              row: rowNumber,
              reason: message,
              suggestion: 'Check data validity in row',
            });
          }
        }
      }

      this.logger.log(`Read ${processedRows} rows from file`);

      const finalStatus =
        errorReport.length > 0 ? TaskStatus.COMPLETED : TaskStatus.FAILED;

      await this.tasksService.completeTask(taskId, finalStatus, errorReport);

      this.logger.log(
        `Task ${taskId} completed. Processed ${processedRows} rows, ${errorReport.length} errors`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';
      this.logger.error(`Task ${taskId} failed: ${message}`);

      errorReport.push({
        row: 0,
        reason: `File processing error: ${message}`,
        suggestion: 'Check if XLSX file is valid',
      });

      await this.tasksService.completeTask(
        taskId,
        TaskStatus.FAILED,
        errorReport,
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

  private async validateDto(dto: ReservationRowDto): Promise<string[]> {
    const errors = await validate(dto);
    return errors.flatMap((err) =>
      Object.values(err.constraints || {}).map((msg) => msg),
    );
  }

  private getSuggestionForErrors(errors: string[]): string {
    const suggestions: string[] = [];

    for (const error of errors) {
      if (error.toLowerCase().includes('reservation id')) {
        suggestions.push('Add unique reservation ID');
      } else if (error.toLowerCase().includes('guest name')) {
        suggestions.push('Add guest name');
      } else if (error.toLowerCase().includes('status')) {
        suggestions.push(
          'Use one of allowed statuses: oczekująca, zrealizowana, anulowana',
        );
      } else if (error.toLowerCase().includes('check-in')) {
        suggestions.push('Use YYYY-MM-DD date format for check-in date');
      } else if (error.toLowerCase().includes('check-out')) {
        suggestions.push('Use YYYY-MM-DD date format for check-out date');
      } else if (error.toLowerCase().includes('after')) {
        suggestions.push('Ensure check-out date is after check-in date');
      }
    }

    return suggestions.length > 0
      ? suggestions.join('; ')
      : 'Check data validity';
  }
}
