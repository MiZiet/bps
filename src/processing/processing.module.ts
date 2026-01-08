import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FileProcessor } from './file.processor';
import { TasksModule } from '../tasks/tasks.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { TASKS_QUEUE } from '../common/constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: TASKS_QUEUE,
    }),
    TasksModule,
    ReservationsModule,
  ],
  providers: [FileProcessor],
})
export class ProcessingModule {}
