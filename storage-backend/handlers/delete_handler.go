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

func (h *DeleteHandler) authorize(c *gin.Context) bool {
	apiKey := c.GetHeader("X-Internal-API-Key")
	if apiKey != h.cfg.InternalAPIKey {
		lessonID := c.Param("lesson_id")
		log.Printf("Unauthorized delete attempt for lesson %s: invalid API key", lessonID)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return false
	}
	return true
}

// DeleteLessonFiles handles DELETE /files/:lesson_id
func (h *DeleteHandler) DeleteLessonFiles(c *gin.Context) {
	lessonID := c.Param("lesson_id")
	if lessonID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lesson_id is required"})
		return
	}

	if !h.authorize(c) {
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

// DeleteLessonVideo handles DELETE /files/:lesson_id/video
func (h *DeleteHandler) DeleteLessonVideo(c *gin.Context) {
	lessonID := c.Param("lesson_id")
	if lessonID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lesson_id is required"})
		return
	}

	if !h.authorize(c) {
		return
	}

	videoDir := filepath.Join(h.cfg.VideosDir, lessonID)
	deleted := false
	if err := os.RemoveAll(videoDir); err != nil {
		log.Printf("Failed to delete video directory %s: %v", videoDir, err)
	} else {
		deleted = true
		log.Printf("Deleted video directory: %s", videoDir)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "lesson video deleted",
		"lesson_id": lessonID,
		"deleted":   deleted,
	})
}

// DeleteLessonMaterial handles DELETE /files/:lesson_id/materials/:material_id
func (h *DeleteHandler) DeleteLessonMaterial(c *gin.Context) {
	lessonID := c.Param("lesson_id")
	materialID := c.Param("material_id")
	if lessonID == "" || materialID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lesson_id and material_id are required"})
		return
	}

	if !h.authorize(c) {
		return
	}

	materialDir := filepath.Join(h.cfg.MaterialsDir, lessonID, materialID)
	deleted := false
	if err := os.RemoveAll(materialDir); err != nil {
		log.Printf("Failed to delete material directory %s: %v", materialDir, err)
	} else {
		deleted = true
		log.Printf("Deleted material directory: %s", materialDir)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":     "lesson material deleted",
		"lesson_id":   lessonID,
		"material_id": materialID,
		"deleted":     deleted,
	})
}
