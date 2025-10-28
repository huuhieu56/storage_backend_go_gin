package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	ServerAddr     string
	UploadTmpDir   string
	VideosDir      string
	MaterialsDir   string
	ChunkSize      int64
	MaxConcurrent  int
	MergeWorkers   int
	MainBackendURL string
	PublicBaseURL  string
	FFProbePath    string
	JWTSecret      string
	InternalAPIKey string // API key for internal backend-to-backend communication

	// Performance tuning
	FileWriteWorkers int // Number of async file writers
	WriteQueueSize   int // Write queue buffer size
	UploadBufferSize int // Buffer size for reading uploads (bytes)
	MergeBufferSize  int // Buffer size for merging files (bytes)
	HTTPReadTimeout  int // HTTP read timeout (seconds)
	HTTPWriteTimeout int // HTTP write timeout (seconds)
}

func Load() *Config {
	chunkSize, _ := strconv.ParseInt(getEnv("CHUNK_SIZE", "16777216"), 10, 64) // 16MB default
	maxConcurrent, _ := strconv.Atoi(getEnv("MAX_CONCURRENT_UPLOADS", "50"))   // Increased to 50
	mergeWorkers, _ := strconv.Atoi(getEnv("MERGE_WORKERS", "5"))

	// Performance tuning parameters
	fileWriteWorkers, _ := strconv.Atoi(getEnv("FILE_WRITE_WORKERS", "30"))
	writeQueueSize, _ := strconv.Atoi(getEnv("WRITE_QUEUE_SIZE", "500"))
	uploadBufferSize, _ := strconv.Atoi(getEnv("UPLOAD_BUFFER_SIZE", "67108864")) // 64MB
	mergeBufferSize, _ := strconv.Atoi(getEnv("MERGE_BUFFER_SIZE", "67108864"))   // 64MB
	httpReadTimeout, _ := strconv.Atoi(getEnv("HTTP_READ_TIMEOUT", "600"))        // 10 min
	httpWriteTimeout, _ := strconv.Atoi(getEnv("HTTP_WRITE_TIMEOUT", "600"))      // 10 min

	// Get base directory (parent of storage-backend)
	baseDir := getEnv("BASE_DIR", "../file_uploads")
	absBaseDir, _ := filepath.Abs(baseDir)

	publicBase := os.Getenv("PUBLIC_BASE_URL")
	if publicBase == "" {
		nginxPort := getEnv("NGINX_PORT", "8081")
		publicBase = fmt.Sprintf("http://localhost:%s", nginxPort)
	}

	return &Config{
		ServerAddr:       getEnv("SERVER_ADDR", ":8080"),
		UploadTmpDir:     filepath.Join(absBaseDir, "uploads/tmp"),
		VideosDir:        filepath.Join(absBaseDir, "videos"),
		MaterialsDir:     filepath.Join(absBaseDir, "materials"),
		ChunkSize:        chunkSize,
		MaxConcurrent:    maxConcurrent,
		MergeWorkers:     mergeWorkers,
		MainBackendURL:   getEnv("MAIN_BACKEND_URL", "http://localhost:8000"),
		PublicBaseURL:    publicBase,
		FFProbePath:      getEnv("FFPROBE_PATH", "ffprobe"),
		JWTSecret:        getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
		InternalAPIKey:   getEnv("INTERNAL_API_KEY", "change-this-to-a-secure-random-key-in-production"),
		FileWriteWorkers: fileWriteWorkers,
		WriteQueueSize:   writeQueueSize,
		UploadBufferSize: uploadBufferSize,
		MergeBufferSize:  mergeBufferSize,
		HTTPReadTimeout:  httpReadTimeout,
		HTTPWriteTimeout: httpWriteTimeout,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
