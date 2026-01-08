import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  Logger,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  private readonly logger = new Logger(TasksController.name);

  constructor(private readonly tasksService: TasksService) {}

  /**
   * POST /tasks/upload
   *
   * Accepts XLSX file via multipart/form-data and saves it to disk.
   * Creates a task entry in MongoDB with status PENDING.
   * Returns the generated taskId for tracking.
   *
   * Usage:
   *   curl -X POST http://localhost:3000/tasks/upload -F "file=@myfile.xlsx"
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      // diskStorage = streaming to disk (not memory!)
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          // Generate unique filename: timestamp + original extension
          const uniqueName = `${Date.now()}${extname(file.originalname)}`;
          callback(null, uniqueName);
        },
      }),
      // File filter runs BEFORE upload starts
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.xlsx$/i)) {
          return callback(
            new BadRequestException('Only .xlsx files are allowed'),
            false,
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    this.logger.log(`File saved: ${file.filename} (${file.size} bytes)`);

    // Create task in database
    const task = await this.tasksService.createTask(file.path);

    return {
      message: 'File uploaded successfully',
      taskId: task._id.toString(),
    };
  }

  /**
   * GET /tasks/status/:taskId
   *
   * Returns the current status of a task and any error report.
   *
   * Usage:
   *   curl http://localhost:3000/tasks/status/507f1f77bcf86cd799439011
   */
  @Get('status/:taskId')
  async getTaskStatus(@Param('taskId') taskId: string) {
    this.logger.log(`Getting status for task ${taskId}`);

    const task = await this.tasksService.findById(taskId);

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    return {
      taskId: task._id.toString(),
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      reportPath: task.reportPath,
    };
  }

  /**
   * GET /tasks/report/:taskId
   *
   * Returns the errors report of a task.
   *
   * Usage:
   *   curl http://localhost:3000/tasks/report/507f1f77bcf86cd799439011
   */
  @Get('report/:taskId')
  async getTaskReport(@Param('taskId') taskId: string, @Res() res: Response) {
    this.logger.log(`Getting report for task ${taskId}`);

    const task = await this.tasksService.findById(taskId);

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    if (!task.reportPath) {
      return res.json({
        message: 'No errors found during processing',
        errors: [],
      });
    }

    return res.download(task.reportPath);
  }
}
