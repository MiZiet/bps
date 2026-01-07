import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TASKS_QUEUE } from './tasks.constants';

export interface TaskJobData {
  taskId: string;
}

@Processor(TASKS_QUEUE)
export class TasksProcessor extends WorkerHost {
  private readonly logger = new Logger(TasksProcessor.name);

  async process(job: Job<TaskJobData>): Promise<void> {
    const { taskId } = job.data;

    this.logger.log(`Processing task: ${taskId}`);
  }
}
