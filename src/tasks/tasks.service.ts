import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { Task, TaskDocument, TaskStatus } from './schemas/task.schema';
import { TasksGateway } from './tasks.gateway';
import { TASKS_QUEUE } from '../common/constants';
import { TaskJobData } from '../processing/file.processor';

// Emit progress update every N rows to avoid flooding the WebSocket
const PROGRESS_EMIT_INTERVAL = 100;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectQueue(TASKS_QUEUE) private tasksQueue: Queue<TaskJobData>,
    private readonly tasksGateway: TasksGateway,
  ) {}

  /**
   * Create a new task for the uploaded file.
   * MongoDB automatically generates _id which we use as taskId.
   */
  async createTask(filePath: string): Promise<TaskDocument> {
    const task = new this.taskModel({
      filePath,
      status: TaskStatus.PENDING,
    });

    const savedTask = await task.save();
    const taskId = savedTask._id.toString();
    this.logger.log(`Task ${taskId} created with status ${savedTask.status}`);

    await this.tasksQueue.add('process-file', { taskId });
    this.logger.log(`Task ${taskId} added to queue`);

    return savedTask;
  }

  /**
   * Find task by MongoDB _id
   */
  async findById(taskId: string): Promise<TaskDocument | null> {
    return this.taskModel.findById(taskId).exec();
  }

  /**
   * Update task status
   */
  async updateStatus(
    taskId: string,
    status: TaskStatus,
  ): Promise<TaskDocument | null> {
    this.logger.log(`Updating task ${taskId} status to ${status}`);

    const task = await this.taskModel
      .findByIdAndUpdate(taskId, { status }, { new: true })
      .exec();

    // Emit WebSocket update
    this.tasksGateway.emitStatusUpdate({
      taskId,
      status,
      timestamp: new Date(),
    });

    return task;
  }

  /**
   * Complete task with status and error report
   */
  async completeTask(
    taskId: string,
    status: TaskStatus.COMPLETED | TaskStatus.FAILED,
    reportPath?: string,
  ): Promise<TaskDocument | null> {
    this.logger.log(
      `Completing task ${taskId} with status ${status}, reported saved at ${reportPath}`,
    );

    const task = await this.taskModel.findByIdAndUpdate(taskId, {
      status,
      reportPath,
    });

    // Emit WebSocket update
    this.tasksGateway.emitStatusUpdate({
      taskId,
      status,
      timestamp: new Date(),
      reportPath,
    });

    return task;
  }

  /**
   * Emit progress update via WebSocket.
   * Only emits every PROGRESS_EMIT_INTERVAL rows to avoid flooding.
   */
  emitProgress(
    taskId: string,
    processedRows: number,
    errorCount: number,
  ): void {
    // Only emit on interval boundaries
    if (processedRows % PROGRESS_EMIT_INTERVAL === 0) {
      this.tasksGateway.emitProgressUpdate({
        taskId,
        processedRows,
        errorCount,
        timestamp: new Date(),
      });
    }
  }
}
