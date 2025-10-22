#!/bin/bash

# Create file_uploads directory if not exists
mkdir -p ../file_uploads/uploads/tmp
mkdir -p ../file_uploads/videos
mkdir -p ../file_uploads/materials

echo "✓ Created file_uploads directories"
echo ""
echo "Starting Storage Backend..."
echo "Files will be saved to: $(cd .. && pwd)/file_uploads"
echo ""

# Run the backend
go run main.go
