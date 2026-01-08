import { ReportErrorCode } from './report-error-code.enum';

export interface RawReportError {
  row: number;
  code: ReportErrorCode;
  field?: string;
  message?: string;
}
