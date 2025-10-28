# Multi-stage build for Go backend
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o /storage-backend .

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy binary from builder
COPY --from=builder /storage-backend .

# Create necessary directories
RUN mkdir -p /srv/cosign/uploads/tmp /srv/cosign/videos /srv/cosign/materials

# Expose port
EXPOSE 8080

# Run the application
CMD ["./storage-backend"]
