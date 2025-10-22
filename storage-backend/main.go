package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"storage-backend/config"
	"storage-backend/handlers"
	"storage-backend/services"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := config.Load()

	log.Printf("=== Storage Backend Configuration ===")
	log.Printf("Server Address: %s", cfg.ServerAddr)
	log.Printf("Upload Tmp Dir: %s", cfg.UploadTmpDir)
	log.Printf("Videos Dir: %s", cfg.VideosDir)
	log.Printf("Materials Dir: %s", cfg.MaterialsDir)
	log.Printf("=====================================")

	// Create necessary directories
	if err := os.MkdirAll(cfg.UploadTmpDir, 0755); err != nil {
		log.Fatalf("Failed to create upload tmp dir: %v", err)
	}
	if err := os.MkdirAll(cfg.VideosDir, 0755); err != nil {
		log.Fatalf("Failed to create videos dir: %v", err)
	}
	if err := os.MkdirAll(cfg.MaterialsDir, 0755); err != nil {
		log.Fatalf("Failed to create materials dir: %v", err)
	}

	log.Printf("✓ All directories created successfully")

	// Initialize services
	uploadService := services.NewUploadService(cfg)
	mergeService := services.NewMergeService(cfg)

	// Start merge worker
	go mergeService.StartWorker()

	// Setup router
	r := gin.Default()

	// CORS configuration - Allow all origins for development
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowAllOrigins = true
	corsConfig.AllowHeaders = []string{"Origin", "Content-Type", "Authorization", "X-Upload-Token", "Content-Length", "Content-Range"}
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	r.Use(cors.New(corsConfig))

	// Initialize handlers
	uploadHandler := handlers.NewUploadHandler(uploadService, mergeService, cfg)

	// Routes
	uploads := r.Group("/uploads")
	{
		// Video uploads
		uploads.POST("/videos", uploadHandler.InitVideoUpload)
		uploads.PUT("/:upload_id/parts/:part_num", uploadHandler.UploadPart)
		uploads.POST("/:upload_id/complete", uploadHandler.CompleteUpload)
		uploads.GET("/:upload_id/status", uploadHandler.GetUploadStatus)
		uploads.GET("/:upload_id/parts", uploadHandler.GetUploadedParts) // NEW: Resumable upload support

		// File/Material uploads (same flow as video)
		uploads.POST("/files", uploadHandler.InitFileUpload)
	}

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Create HTTP server with custom settings for high concurrency
	srv := &http.Server{
		Addr:           cfg.ServerAddr,
		Handler:        r,
		ReadTimeout:    time.Duration(cfg.HTTPReadTimeout) * time.Second,
		WriteTimeout:   time.Duration(cfg.HTTPWriteTimeout) * time.Second,
		IdleTimeout:    120 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1MB
	}

	// Start server in goroutine
	go func() {
		log.Printf("🚀 Storage Backend starting on %s", cfg.ServerAddr)
		log.Printf("📊 Max concurrent uploads: %d", cfg.MaxConcurrent)
		log.Printf("💾 File write workers: %d", cfg.FileWriteWorkers)
		log.Printf("📦 Upload buffer size: %d MB", cfg.UploadBufferSize/(1024*1024))
		log.Printf("⚡ Optimized for FULL GIGABIT SPEED - No artificial limits!")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// Graceful shutdown with 30 second timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exited")
}
