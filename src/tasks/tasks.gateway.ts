import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TaskStatus } from './schemas/task.schema';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

export interface TaskStatusUpdate {
  taskId: string;
  status: TaskStatus;
  timestamp: Date;
  reportPath?: string;
}

export interface TaskProgressUpdate {
  taskId: string;
  processedRows: number;
  errorCount: number;
  timestamp: Date;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/tasks',
})
@UseGuards(ApiKeyGuard)
export class TasksGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TasksGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Client subscribes to updates for a specific task
   * Usage: socket.emit('subscribe', { taskId: '...' })
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { taskId: string },
  ) {
    const room = `task:${data.taskId}`;
    void client.join(room);
    this.logger.log(`Client ${client.id} subscribed to ${room}`);
    return { event: 'subscribed', data: { taskId: data.taskId } };
  }

  /**
   * Client unsubscribes from updates for a specific task
   * Usage: socket.emit('unsubscribe', { taskId: '...' })
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { taskId: string },
  ) {
    const room = `task:${data.taskId}`;
    void client.leave(room);
    this.logger.log(`Client ${client.id} unsubscribed from ${room}`);
    return { event: 'unsubscribed', data: { taskId: data.taskId } };
  }

  /**
   * Emit task status update to all clients subscribed to this task
   * Called by TasksService when status changes
   */
  emitStatusUpdate(update: TaskStatusUpdate) {
    const room = `task:${update.taskId}`;
    this.server.to(room).emit('status', update);
    this.logger.log(
      `Emitted status update for task ${update.taskId}: ${update.status}`,
    );
  }

  /**
   * Emit task progress update to all clients subscribed to this task
   * Called during file processing to report progress
   */
  emitProgressUpdate(update: TaskProgressUpdate) {
    const room = `task:${update.taskId}`;
    this.server.to(room).emit('progress', update);
  }
}
