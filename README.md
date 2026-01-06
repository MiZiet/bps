# Booking Processing Service

A NestJS service for processing reservation files (XLSX).

## Current Features

- ✅ Upload XLSX files via REST API (streaming to disk)
- ✅ File validation (only `.xlsx` files accepted)
- ✅ File size limit (10MB)

## Tech Stack

- **NestJS** - Node.js framework
- **Multer** - File upload handling (with streaming via `diskStorage`)
- **TypeScript** - Type safety

## Simplifications & Trade-offs

This project uses some simplified solutions for development purposes:

| Area | Current (Dev) | Production Alternative |
|------|---------------|------------------------|
| File Storage | Local disk (`./uploads`) | AWS S3, Google Cloud Storage, Azure Blob |

> **Note:** Switching to cloud storage would require replacing `diskStorage` with a streaming upload to the cloud provider (e.g., using `multer-s3` for AWS S3).

## Project Structure

```
src/
├── app.module.ts          # Main application module
└── tasks/
    ├── tasks.module.ts    # Tasks module
    └── tasks.controller.ts # File upload endpoint
uploads/                   # Uploaded files are stored here
scripts/
└── generate-sample.js     # Script to generate sample XLSX file
```

## Installation

```bash
pnpm install
```

## Running the App

```bash
# Development (watch mode)
pnpm start:dev

# Production
pnpm start:prod
```

## API Endpoints

### Upload File

```http
POST /tasks/upload
Content-Type: multipart/form-data
```

**Request:**
- Field: `file` - XLSX file to upload

**Response:**
```json
{
  "message": "File uploaded successfully",
  "filename": "1736171234567.xlsx",
  "originalName": "reservations.xlsx",
  "size": 1024
}
```

**Errors:**
- `400` - No file provided
- `400` - Only .xlsx files are allowed

### Example with cURL

```bash
curl -X POST http://localhost:3000/tasks/upload -F "file=@sample-reservations.xlsx"
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
