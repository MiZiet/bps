# Booking Processing Service

A NestJS service for processing reservation files (XLSX) with async queue processing.

## Current Features

- ✅ Upload XLSX files via REST API (streaming to disk)
- ✅ File validation (only `.xlsx` files accepted)
- ✅ File size limit (10MB)
- ✅ Optional API key authentication
- ✅ Docker & Docker Compose support
- ✅ MongoDB storage for tasks and reservations
- ✅ BullMQ queue for async file processing with retry mechanism
- ✅ Streaming XLSX parsing with ExcelJS (memory efficient)
- ✅ Validation with class-validator
- ✅ Error report generation with row numbers and suggestions
- ✅ Duplicate detection within files
- ✅ Business logic: cancelled/completed reservations only update existing records

## Tech Stack

- **NestJS** - Node.js framework
- **MongoDB/Mongoose** - Database for tasks and reservations
- **BullMQ/Redis** - Async job queue processing
- **ExcelJS** - Streaming XLSX file parsing
- **class-validator/class-transformer** - DTO validation
- **Multer** - File upload handling (with streaming via `diskStorage`)
- **TypeScript** - Type safety

## Simplifications & Trade-offs

This project uses some simplified solutions for development purposes:

| Area | Current (Dev)                                                                     | Production Alternative |
|------|-----------------------------------------------------------------------------------|------------------------|
| File Storage | Local disk (`./uploads` for uploaded files and `./reports` for generated reports) | AWS S3, Google Cloud Storage, Azure Blob |
| Authentication | Single API key in env for all users                                               | JWT tokens, OAuth2, API keys per user/client stored in DB |

> **Note:** Switching to cloud storage would require replacing `diskStorage` with a streaming upload to the cloud provider (e.g., using `multer-s3` for AWS S3).

> **Note:** For production authentication, consider:
> - **JWT tokens** - Stateless, supports user identity and roles
> - **OAuth2** - For third-party integrations
> - **Per-client API keys** - Stored in database, with rate limiting and usage tracking
> - **API Gateway** - AWS API Gateway, Kong, or similar for centralized auth

## Project Structure

```
src/
├── app.module.ts                  # Main application module
├── common/
│   ├── constants.ts               # Shared constants (queue names)
│   └── guards/
│       └── api-key.guard.ts       # API key authentication guard
├── tasks/
│   ├── schemas/
│   │   └── task.schema.ts         # MongoDB Task schema
│   ├── tasks.module.ts            # Tasks module
│   ├── tasks.controller.ts        # REST endpoints (upload, status, report)
│   └── tasks.service.ts           # Task business logic
├── reservations/
│   ├── schemas/
│   │   └── reservation.schema.ts  # MongoDB Reservation schema
│   ├── dto/
│   │   └── reservation-row.dto.ts # DTO with validation decorators
│   ├── reservations.module.ts     # Reservations module
│   └── reservations.service.ts    # Reservation business logic
├── processing/
│   ├── processing.module.ts       # Processing module (BullMQ)
│   └── file.processor.ts          # Queue worker for XLSX processing
└── reports/
    ├── reports.module.ts          # Reports module
    ├── reports.service.ts         # Error report generation
    ├── report-error-code.enum.ts  # Error code enumeration
    └── raw-report-error.interface.ts # Raw error interface
uploads/                           # Uploaded files are stored here
reports/                           # Generated error reports
scripts/
└── generate-sample.js             # Script to generate sample XLSX file
Dockerfile                         # Docker image definition
docker-compose.yml                 # Full stack (app + MongoDB + Redis)
docker-compose.dev.yml             # Development (MongoDB + Redis only)
```

## Installation

```bash
pnpm install
cp .env.example .env  # Configure environment variables
```

## Configuration

Environment variables (`.env`):

| Variable | Description | Default |
|----------|-------------|---------|
| `API_KEY` | API key for authentication (optional) | empty (auth disabled) |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/booking-service` |

## Running the App

### With Docker (Recommended)

```bash
# Start all services (app + MongoDB)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

### Local Development

```bash
# Start MongoDB only
docker-compose -f docker-compose.dev.yml up -d

# Start app in watch mode
pnpm start:dev
```

### Production (without Docker)

```bash
pnpm build
pnpm start:prod
```

## API Endpoints

### Upload File

```http
POST /tasks/upload
Content-Type: multipart/form-data
x-api-key: your-secret-api-key  # Required if API_KEY is set
```

**Request:**
- Field: `file` - XLSX file to upload
- Header: `x-api-key` - API key (required if `API_KEY` env is set)

**Response:**
```json
{
  "message": "File uploaded successfully",
  "taskId": "507f1f77bcf86cd799439011"
}
```

**Errors:**
- `400` - No file provided
- `400` - Only .xlsx files are allowed
- `401` - Missing x-api-key header (when API_KEY is configured)
- `401` - Invalid API key

### Get Task Status

```http
GET /tasks/status/:taskId
x-api-key: your-secret-api-key  # Required if API_KEY is set
```

**Response:**
```json
{
  "taskId": "507f1f77bcf86cd799439011",
  "status": "PENDING",
  "createdAt": "2026-01-06T12:00:00.000Z",
  "updatedAt": "2026-01-06T12:00:00.000Z",
  "errorReport": []
}
```

**Status values:**
- `PENDING` - Task created, waiting to be processed
- `IN_PROGRESS` - Task is being processed
- `COMPLETED` - Task finished successfully
- `FAILED` - Task failed (check `errorReport` for details)

**Error report format (when status is FAILED):**
```json
{
  "taskId": "507f1f77bcf86cd799439011",
  "status": "FAILED",
  "errorReport": [
    {
      "row": 2,
      "reason": "Invalid date format",
      "suggestion": "Use YYYY-MM-DD format"
    }
  ]
}
```

**Errors:**
- `401` - Missing x-api-key header (when API_KEY is configured)
- `401` - Invalid API key
- `404` - Task not found

### Download Error Report

```http
GET /tasks/report/:taskId
x-api-key: your-secret-api-key  # Required if API_KEY is set
```

**Response (when errors exist):** Downloads JSON file with error details.

```json
[
  {
    "row": 2,
    "reason": "Missing required field: guestName",
    "suggestion": "Provide value for field \"guestName\""
  },
  {
    "row": 5,
    "reason": "Invalid reservation status",
    "suggestion": "Use one of allowed values: oczekująca, zrealizowana, anulowana"
  }
]
```

**Response (when no errors):**
```json
{
  "message": "No errors found during processing",
  "errors": []
}
```

**Error types:**
| Error | Reason | Suggestion |
|-------|--------|------------|
| `MISSING_FIELD` | Missing required field: {field} | Provide value for field "{field}" |
| `INVALID_DATE` | Invalid date format in field: {field} | Use YYYY-MM-DD format |
| `INVALID_STATUS` | Invalid reservation status | Use one of allowed values: oczekująca, zrealizowana, anulowana |
| `CHECKOUT_BEFORE_CHECKIN` | Check-out date is before check-in date | Ensure check-out date is after check-in date |
| `DUPLICATE` | Duplicate reservation ID: {id} | Remove duplicate entry or use unique reservation ID |

**Errors:**
- `401` - Missing x-api-key header (when API_KEY is configured)
- `401` - Invalid API key
- `404` - Task not found

### Example with cURL

```bash
# Upload file (without API key)
curl -X POST http://localhost:3000/tasks/upload -F "file=@sample-reservations.xlsx"

# Upload file (with API key)
curl -X POST http://localhost:3000/tasks/upload \
  -H "x-api-key: your-secret-api-key" \
  -F "file=@sample-reservations.xlsx"

# Get task status
curl http://localhost:3000/tasks/status/507f1f77bcf86cd799439011

# Get task status (with API key)
curl http://localhost:3000/tasks/status/507f1f77bcf86cd799439011 \
  -H "x-api-key: your-secret-api-key"

# Download error report
curl -O http://localhost:3000/tasks/report/507f1f77bcf86cd799439011 \
  -H "x-api-key: your-secret-api-key"
```

### Example with HTTP file (JetBrains IDE)

Use the `requests.http` file in the project root.

## Queue Processing & Retries

The service uses BullMQ for async file processing with built-in retry mechanism:

| Setting | Value | Description |
|---------|-------|-------------|
| `attempts` | 3 | Maximum retry attempts |
| `backoff.type` | exponential | Backoff strategy |
| `backoff.delay` | 1000ms | Initial delay (1s → 2s → 4s) |
| `removeOnComplete` | true | Clean up successful jobs |
| `removeOnFail` | false | Keep failed jobs for inspection |

**Logging:**
- Retry attempts are logged with `WARN` level
- Permanent failures are logged with `ERROR` level

**Example log output:**
```
[FileProcessor] Task 507f1f77... failed (attempt 1/3), will retry: ENOENT: no such file
[FileProcessor] Task 507f1f77... failed (attempt 2/3), will retry: ENOENT: no such file
[FileProcessor] Task 507f1f77... failed permanently after 3 attempts: ENOENT: no such file
```

## Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Test coverage
pnpm test:cov
```

## Generate Sample XLSX File

```bash
node scripts/generate-sample.js
node scripts/generate-sample-with-errors.js
```

This creates `sample-reservations.xlsx` with example reservation data:

| reservation_id | guest_name | status | check_in_date | check_out_date |
|----------------|------------|--------|---------------|----------------|
| 12345 | Jan Nowak | oczekująca | 2024-05-01 | 2024-05-07 |
| 12346 | Anna Kowal | anulowana | 2024-06-10 | 2024-06-15 |
| ... | ... | ... | ... | ... |
