package handlers

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"storage-backend/config"

	"github.com/gin-gonic/gin"
)

// DeleteHandler handles file deletion requests from main backend
type DeleteHandler struct {
	cfg *config.Config
}

// NewDeleteHandler creates a new delete handler
func NewDeleteHandler(cfg *config.Config) *DeleteHandler {
	return &DeleteHandler{cfg: cfg}
}

// DeleteLessonFiles handles DELETE /files/:lesson_id
func (h *DeleteHandler) DeleteLessonFiles(c *gin.Context) {
	lessonID := c.Param("lesson_id")
	if lessonID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lesson_id is required"})
		return
	}

	// Internal auth: check for internal API key
	apiKey := c.GetHeader("X-Internal-API-Key")
	if apiKey != h.cfg.InternalAPIKey {
		log.Printf("Unauthorized delete attempt for lesson %s: invalid API key", lessonID)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Delete video directory
	videoDir := filepath.Join(h.cfg.VideosDir, lessonID)
	videoDeleted := false
	if err := os.RemoveAll(videoDir); err != nil {
		log.Printf("Failed to delete video directory %s: %v", videoDir, err)
	} else {
		videoDeleted = true
		log.Printf("Deleted video directory: %s", videoDir)
	}

	// Delete materials directory
	materialsDir := filepath.Join(h.cfg.MaterialsDir, lessonID)
	materialsDeleted := false
	if err := os.RemoveAll(materialsDir); err != nil {
		log.Printf("Failed to delete materials directory %s: %v", materialsDir, err)
	} else {
		materialsDeleted = true
		log.Printf("Deleted materials directory: %s", materialsDir)
	}

	// Return success if at least one deletion succeeded
	c.JSON(http.StatusOK, gin.H{
		"message":           "lesson files deleted",
		"lesson_id":         lessonID,
		"video_deleted":     videoDeleted,
		"materials_deleted": materialsDeleted,
	})
}
