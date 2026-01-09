export class ReportErrorItemDto {
  row: number;
  reason: string;
  suggestion: string;
}

export class ReportResponseDto {
  message?: string;
  errors: ReportErrorItemDto[];
}
