package handlers

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"storage-backend/config"
	"storage-backend/models"
	"storage-backend/services"
	"sync"

	"github.com/gin-gonic/gin"
)

// Dynamic buffer pool based on config
var bufferPool *sync.Pool
var bufferSize int

type UploadHandler struct {
	uploadSvc *services.UploadService
	mergeSvc  *services.MergeService
	cfg       *config.Config
}

func NewUploadHandler(uploadSvc *services.UploadService, mergeSvc *services.MergeService, cfg *config.Config) *UploadHandler {
	mergeSvc.SetUploadService(uploadSvc)
	
	// Initialize buffer pool with config size
	bufferSize = cfg.UploadBufferSize
	bufferPool = &sync.Pool{
		New: func() interface{} {
			return make([]byte, bufferSize)
		},
	}
	
	log.Printf("Upload handler initialized with %d MB buffers", bufferSize/(1024*1024))
	
	return &UploadHandler{
		uploadSvc: uploadSvc,
		mergeSvc:  mergeSvc,
		cfg:       cfg,
	}
}

// InitVideoUpload handles POST /uploads/videos
func (h *UploadHandler) InitVideoUpload(c *gin.Context) {
	var req models.InitUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// TODO: Validate JWT token with main backend
	// For now, skip authentication as per requirements

	// Set default content type if not provided
	if req.ContentType == "" {
		req.ContentType = "video/mp4"
	}

	// Validate content type for video
	if req.ContentType != "video/mp4" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only video/mp4 is supported"})
		return
	}

	session, err := h.uploadSvc.CreateSession(&req, models.TypeVideo)
	if err != nil {
		if err.Error() == "too many concurrent uploads, please retry later" {
			c.Header("Retry-After", "60")
			c.JSON(http.StatusTooManyRequests, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := models.InitUploadResponse{
		UploadID:    session.UploadID,
		UploadToken: session.UploadToken,
		ChunkSize:   16777216, // 16MB
		PutURL:      fmt.Sprintf("/uploads/%s/parts/{n}", session.UploadID),
	}

	c.JSON(http.StatusOK, response)
}

// InitFileUpload handles POST /uploads/files
func (h *UploadHandler) InitFileUpload(c *gin.Context) {
	var req models.InitUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate material_id is provided
	if req.MaterialID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "material_id is required for file uploads"})
		return
	}

	// Set default content type if not provided
	if req.ContentType == "" {
		req.ContentType = "application/octet-stream"
	}

	// REMOVED: No content type validation for materials
	// Accept ANY file type: documents, images, archives, videos, etc.
	// The system will store whatever the user uploads

	session, err := h.uploadSvc.CreateSession(&req, models.TypeMaterial)
	if err != nil {
		if err.Error() == "too many concurrent uploads, please retry later" {
			c.Header("Retry-After", "60")
			c.JSON(http.StatusTooManyRequests, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := models.InitUploadResponse{
		UploadID:    session.UploadID,
		UploadToken: session.UploadToken,
		ChunkSize:   16777216, // 16MB
		PutURL:      fmt.Sprintf("/uploads/%s/parts/{n}", session.UploadID),
	}

	c.JSON(http.StatusOK, response)
}

// UploadPart handles PUT /uploads/:upload_id/parts/:part_num
func (h *UploadHandler) UploadPart(c *gin.Context) {
	uploadID := c.Param("upload_id")
	partNumStr := c.Param("part_num")
	
	partNum, err := strconv.Atoi(partNumStr)
	if err != nil || partNum < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid part number"})
		return
	}

	uploadToken := c.GetHeader("X-Upload-Token")
	if uploadToken == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing upload token"})
		return
	}

	// Validate token BEFORE reading body (fast path)
	if err := h.uploadSvc.ValidateToken(uploadID, uploadToken); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid upload token"})
		return
	}

	// Get buffer from pool
	buf := bufferPool.Get().([]byte)
	defer bufferPool.Put(buf)

	// Read body with MAXIMUM buffer size for FULL SPEED
	var bodyBuf bytes.Buffer
	bodyBuf.Grow(bufferSize)
	
	// Use large portion of buffer for copy (25% of total buffer)
	copyBufSize := bufferSize / 4
	n, err := io.CopyBuffer(&bodyBuf, io.LimitReader(c.Request.Body, int64(bufferSize)), buf[:copyBufSize])
	if err != nil {
		log.Printf("Failed to read body for upload %s part %d: %v", uploadID[:8], partNum, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}

	data := bodyBuf.Bytes()
	
	// Log for debugging
	log.Printf("→ Upload %s: part %d, size: %d bytes", uploadID[:8], partNum, n)

	// Save part (this will be async in the service)
	if err := h.uploadSvc.SavePart(uploadID, partNum, data); err != nil {
		log.Printf("❌ Failed to save part %d for upload %s: %v", partNum, uploadID[:8], err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save part"})
		return
	}

	// Return immediately (204 No Content)
	c.Status(http.StatusNoContent)
}

// CompleteUpload handles POST /uploads/:upload_id/complete
func (h *UploadHandler) CompleteUpload(c *gin.Context) {
	uploadID := c.Param("upload_id")
	
	uploadToken := c.GetHeader("X-Upload-Token")
	if uploadToken == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing upload token"})
		return
	}

	// Validate token
	if err := h.uploadSvc.ValidateToken(uploadID, uploadToken); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid upload token"})
		return
	}

	// Mark complete
	if err := h.uploadSvc.MarkComplete(uploadID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get session for merge job
	session, err := h.uploadSvc.GetSession(uploadID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get session"})
		return
	}

	// Enqueue merge job (async)
	h.mergeSvc.EnqueueMerge(uploadID, session)

	// Return immediately
	c.JSON(http.StatusAccepted, models.CompleteUploadResponse{
		Status: "processing",
	})
}

// GetUploadStatus handles GET /uploads/:upload_id/status
func (h *UploadHandler) GetUploadStatus(c *gin.Context) {
	uploadID := c.Param("upload_id")
	
	session, err := h.uploadSvc.GetSession(uploadID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "upload not found"})
		return
	}

	progress := 0.0
	if session.ExpectedSize > 0 {
		progress = float64(session.ReceivedBytes) / float64(session.ExpectedSize) * 100.0
	}

	response := models.UploadStatusResponse{
		UploadID:      session.UploadID,
		Status:        session.Status,
		ReceivedBytes: session.ReceivedBytes,
		ExpectedBytes: session.ExpectedSize,
		Progress:      progress,
		Error:         session.Error,
	}

	c.JSON(http.StatusOK, response)
}

// GetUploadedParts handles GET /uploads/:upload_id/parts
// Returns list of part numbers that have been successfully uploaded
// This enables resumable uploads - client can skip already uploaded parts
func (h *UploadHandler) GetUploadedParts(c *gin.Context) {
	uploadID := c.Param("upload_id")
	
	// Check upload token for security
	uploadToken := c.GetHeader("X-Upload-Token")
	if uploadToken == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing upload token"})
		return
	}

	// Validate token
	if err := h.uploadSvc.ValidateToken(uploadID, uploadToken); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid upload token"})
		return
	}

	// Get uploaded parts
	uploadedParts, err := h.uploadSvc.GetUploadedParts(uploadID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	session, err := h.uploadSvc.GetSession(uploadID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"upload_id":      uploadID,
		"total_parts":    session.TotalParts,
		"uploaded_parts": uploadedParts,
		"missing_parts":  session.TotalParts - len(uploadedParts),
	})
}
