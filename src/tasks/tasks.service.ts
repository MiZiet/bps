import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import {
  Task,
  TaskDocument,
  TaskStatus,
  ErrorReportItem,
} from './schemas/task.schema';
import { TASKS_QUEUE } from '../common/constants';
import { TaskJobData } from '../processing/file.processor';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectQueue(TASKS_QUEUE) private tasksQueue: Queue<TaskJobData>,
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

    return this.taskModel
      .findByIdAndUpdate(taskId, { status }, { new: true })
      .exec();
  }

  /**
   * Complete task with status and error report
   */
  async completeTask(
    taskId: string,
    status: TaskStatus.COMPLETED | TaskStatus.FAILED,
    errorReport: ErrorReportItem[],
  ): Promise<TaskDocument | null> {
    this.logger.log(
      `Completing task ${taskId} with status ${status}, ${errorReport.length} errors`,
    );

    return this.taskModel
      .findByIdAndUpdate(taskId, { status, errorReport }, { new: true })
      .exec();
  }
}
