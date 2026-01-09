import { TaskStatus } from '../schemas/task.schema';

export class StatusResponseDto {
  taskId: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  reportPath?: string;
}
