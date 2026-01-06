import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task, TaskDocument, TaskStatus } from './schemas/task.schema';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(@InjectModel(Task.name) private taskModel: Model<TaskDocument>) {}

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
}
