import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TaskDocument = HydratedDocument<Task>;

/**
 * Task status enum matching requirements:
 * PENDING - Task created, waiting to be processed
 * IN_PROGRESS - Task is currently being processed
 * COMPLETED - Task finished successfully
 * FAILED - Task failed during processing
 */
export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * Error report item for invalid records in XLSX file
 */
export interface ErrorReportItem {
  row: number;
  reason: string;
  suggestion: string;
}

@Schema({ timestamps: true })
export class Task {
  /**
   * Path to the uploaded XLSX file
   */
  @Prop({ required: true })
  filePath: string;

  /**
   * Current status of the task
   */
  @Prop({ required: true, enum: TaskStatus, default: TaskStatus.PENDING })
  status: TaskStatus;

  /**
   * Error report for invalid records (populated after processing)
   */
  @Prop({ type: Array, default: [] })
  errorReport: ErrorReportItem[];

  /**
   * Automatically managed by Mongoose (timestamps: true)
   */
  createdAt?: Date;
  updatedAt?: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
