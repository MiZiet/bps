# Booking Processing Service

A NestJS service for processing reservation files (XLSX).

## Current Features

- ✅ Upload XLSX files via REST API (streaming to disk)
- ✅ File validation (only `.xlsx` files accepted)
- ✅ File size limit (10MB)
- ✅ Optional API key authentication
- ✅ Docker & Docker Compose support
- ✅ MongoDB task storage (taskId, filePath, status, timestamps)

## Tech Stack

- **NestJS** - Node.js framework
- **MongoDB/Mongoose** - Database for task storage
- **Multer** - File upload handling (with streaming via `diskStorage`)
- **TypeScript** - Type safety

## Simplifications & Trade-offs

This project uses some simplified solutions for development purposes:

| Area | Current (Dev) | Production Alternative |
|------|---------------|------------------------|
| File Storage | Local disk (`./uploads`) | AWS S3, Google Cloud Storage, Azure Blob |
| Authentication | Single API key in env for all users | JWT tokens, OAuth2, API keys per user/client stored in DB |

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
│   └── guards/
│       └── api-key.guard.ts       # API key authentication guard
└── tasks/
    ├── schemas/
    │   └── task.schema.ts         # MongoDB Task schema
    ├── tasks.module.ts            # Tasks module
    ├── tasks.controller.ts        # File upload endpoint
    └── tasks.service.ts           # Task business logic
uploads/                           # Uploaded files are stored here
scripts/
└── generate-sample.js             # Script to generate sample XLSX file
Dockerfile                         # Docker image definition
docker-compose.yml                 # Full stack (app + MongoDB)
docker-compose.dev.yml             # Development (MongoDB only)
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
```

### Example with HTTP file (JetBrains IDE)

Use the `requests.http` file in the project root.

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
```

This creates `sample-reservations.xlsx` with example reservation data:

| reservation_id | guest_name | status | check_in_date | check_out_date |
|----------------|------------|--------|---------------|----------------|
| 12345 | Jan Nowak | oczekująca | 2024-05-01 | 2024-05-07 |
| 12346 | Anna Kowal | anulowana | 2024-06-10 | 2024-06-15 |
| ... | ... | ... | ... | ... |

## TODO (Remaining Features)

- [x] `GET /tasks/status/:taskId` - Check task status endpoint
- [ ] `GET /tasks/report/:taskId` - Download error report endpoint
- [ ] BullMQ queue for async file processing
- [ ] XLSX file parsing and validation
- [ ] Reservation storage in MongoDB
- [ ] Error report generation
- [ ] WebSocket for real-time status updates (optional)

