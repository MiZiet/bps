import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('tasks')
export class TasksController {
  private readonly logger = new Logger(TasksController.name);

  /**
   * POST /tasks/upload
   *
   * Accepts XLSX file via multipart/form-data and saves it to disk.
   *
   * How Multer streaming works:
   * 1. Multer uses Busboy internally to parse multipart/form-data
   * 2. With diskStorage, Multer streams directly to disk (no memory buffering)
   * 3. The file is written chunk by chunk as it arrives
   * 4. We get file metadata after upload completes
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
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    this.logger.log(`File saved: ${file.filename} (${file.size} bytes)`);

    return {
      message: 'File uploaded successfully',
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
    };
  }
}
