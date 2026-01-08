import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FileProcessor } from './file.processor';
import { TasksModule } from '../tasks/tasks.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { TASKS_QUEUE } from '../common/constants';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: TASKS_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000, // 1s, 2s, 4s
        },
        removeOnComplete: true,
        removeOnFail: false, // Keep failed jobs for inspection
      },
    }),
    TasksModule,
    ReservationsModule,
    ReportsModule,
  ],
  providers: [FileProcessor],
})
export class ProcessingModule {}
