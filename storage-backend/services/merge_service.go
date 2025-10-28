package services

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"storage-backend/config"
	"storage-backend/models"
	"storage-backend/utils"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type MergeJob struct {
	UploadID string
	Session  *models.UploadSession
}

type MergeService struct {
	cfg       *config.Config
	jobQueue  chan MergeJob
	uploadSvc *UploadService
}

func NewMergeService(cfg *config.Config) *MergeService {
	return &MergeService{
		cfg:      cfg,
		jobQueue: make(chan MergeJob, 100),
	}
}

func (m *MergeService) SetUploadService(svc *UploadService) {
	m.uploadSvc = svc
}

func (m *MergeService) EnqueueMerge(uploadID string, session *models.UploadSession) {
	m.jobQueue <- MergeJob{
		UploadID: uploadID,
		Session:  session,
	}
}

func (m *MergeService) StartWorker() {
	var wg sync.WaitGroup

	for i := 0; i < m.cfg.MergeWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			log.Printf("Merge worker %d started", workerID)

			for job := range m.jobQueue {
				log.Printf("Worker %d processing upload %s", workerID, job.UploadID)
				m.processMerge(job)
			}
		}(i)
	}

	wg.Wait()
}

func (m *MergeService) processMerge(job MergeJob) {
	session := job.Session

	// Update status to merging
	if m.uploadSvc != nil {
		m.uploadSvc.UpdateStatus(job.UploadID, models.StatusMerging, "")
	}

	// Merge parts
	outputPath, hash, materialID, err := m.mergeParts(job.UploadID, session)
	if err != nil {
		log.Printf("Failed to merge upload %s: %v", job.UploadID, err)
		if m.uploadSvc != nil {
			m.uploadSvc.UpdateStatus(job.UploadID, models.StatusFailed, err.Error())
		}
		return
	}

	// Update session with output path
	if m.uploadSvc != nil {
		m.uploadSvc.SetOutputPath(job.UploadID, outputPath)
		m.uploadSvc.UpdateStatus(job.UploadID, models.StatusReady, "")
	}

	// Include hash in the log so the variable is used and for easier debugging
	log.Printf("✓ Upload %s completed successfully! File saved to: %s (hash=%s)", job.UploadID, outputPath, hash)

	duration := 0
	if session.Type == models.TypeVideo {
		if d, err := utils.GetVideoDurationInSeconds(m.cfg.FFProbePath, outputPath); err != nil {
			log.Printf("Failed to extract duration for upload %s: %v", job.UploadID, err)
		} else {
			duration = d
		}
	}

	if err := m.sendWebhook(session, outputPath, hash, duration, materialID); err != nil {
		log.Printf("Failed to send webhook for upload %s: %v", job.UploadID, err)
		// Don't mark as failed if webhook fails - file is still ready
	}

	// Cleanup temp files
	m.cleanup(job.UploadID)
}

func (m *MergeService) mergeParts(uploadID string, session *models.UploadSession) (string, string, string, error) {
	uploadDir := filepath.Join(m.cfg.UploadTmpDir, uploadID)
	partsDir := filepath.Join(uploadDir, "parts")

	// Create temporary output file
	tempOutput := filepath.Join(uploadDir, "input"+filepath.Ext(session.Filename))
	outputFile, err := os.Create(tempOutput)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to create output file: %w", err)
	}
	defer outputFile.Close()

	// Hash calculator
	hasher := sha1.New()

	// Use configured buffer size for merging (maximum throughput)
	buffer := make([]byte, m.cfg.MergeBufferSize)
	log.Printf("Merging with %d MB buffer for maximum speed", m.cfg.MergeBufferSize/(1024*1024))

	for i := 1; i <= session.TotalParts; i++ {
		partPath := filepath.Join(partsDir, fmt.Sprintf("part-%d", i))

		partFile, err := os.Open(partPath)
		if err != nil {
			return "", "", "", fmt.Errorf("failed to open part %d: %w", i, err)
		}

		// Copy with LARGE buffer for maximum throughput
		_, err = io.CopyBuffer(io.MultiWriter(outputFile, hasher), partFile, buffer)
		partFile.Close()

		if err != nil {
			return "", "", "", fmt.Errorf("failed to copy part %d: %w", i, err)
		}
	}

	// Don't sync for speed (comment out fsync)
	// Trade-off: faster but less safe on crash
	// if err := outputFile.Sync(); err != nil {
	// 	return "", "", fmt.Errorf("failed to sync file: %w", err)
	// }
	outputFile.Close()

	// Calculate hash for verification (optional, but keep for integrity check)
	hashStr := hex.EncodeToString(hasher.Sum(nil))

	// Determine final destination - SIMPLIFIED STRUCTURE
	var finalDir string
	var finalPath string
	var materialID string

	if session.Type == models.TypeVideo {
		// Simple structure: /videos/{lesson_id}/video.mp4
		// No SHA1 subdirectory - easier to access via Nginx
		finalDir = filepath.Join(m.cfg.VideosDir, session.LessonID)
		finalPath = filepath.Join(finalDir, "video.mp4")
		log.Printf("Video will be saved to: /videos/%s/video.mp4", session.LessonID)
	} else {
		// Materials: generate new material ID and store under that directory for stable URLs
		materialID = uuid.NewString()
		materialFolder := materialID
		finalDir = filepath.Join(m.cfg.MaterialsDir, session.LessonID, materialFolder)
		finalPath = filepath.Join(finalDir, session.Filename)
		log.Printf("Material will be saved to: /materials/%s/%s/%s", session.LessonID, materialFolder, session.Filename)
	}

	// Create final directory
	if err := os.MkdirAll(finalDir, 0755); err != nil {
		return "", "", "", fmt.Errorf("failed to create final directory: %w", err)
	}

	// Move file to final location
	if err := os.Rename(tempOutput, finalPath); err != nil {
		// If rename fails (cross-device), copy instead
		if err := copyFile(tempOutput, finalPath); err != nil {
			return "", "", "", fmt.Errorf("failed to move file: %w", err)
		}
		os.Remove(tempOutput)
	}

	return finalPath, hashStr, materialID, nil
}

func (m *MergeService) sendWebhook(session *models.UploadSession, _ string, _ string, duration int, materialID string) error {
	var (
		webhookURL string
		payload    interface{}
	)

	publicBase := strings.TrimRight(m.cfg.PublicBaseURL, "/")
	if publicBase == "" {
		publicBase = "http://localhost:8081"
	}

	switch session.Type {
	case models.TypeVideo:
		webhookURL = m.cfg.MainBackendURL + "/internal/storage/video-ready"
		videoURL := fmt.Sprintf("%s/videos/%s/video.mp4", publicBase, session.LessonID)
		videoPayload := models.VideoReadyWebhook{
			LessonID: session.LessonID,
			VideoURL: videoURL,
		}
		if duration > 0 {
			videoPayload.DurationInSeconds = duration
		}
		payload = videoPayload
		log.Printf("Video URL for webhook: %s", videoURL)

	case models.TypeMaterial:
		webhookURL = m.cfg.MainBackendURL + "/internal/storage/file-ready"
		if materialID == "" {
			materialID = session.UploadID
		}
		fileURL := fmt.Sprintf("%s/materials/%s/%s/%s", publicBase, session.LessonID, materialID, session.Filename)
		payload = models.FileReadyWebhook{
			LessonID:    session.LessonID,
			MaterialID:  materialID,
			FileURL:     fileURL,
			Filename:    session.Filename,
			SizeBytes:   session.ExpectedSize,
			ContentType: session.ContentType,
		}

	default:
		return fmt.Errorf("unsupported upload type for webhook: %s", session.Type)
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal webhook payload: %w", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(webhookURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to send webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("webhook returned error %d: %s", resp.StatusCode, string(body))
	}

	log.Printf("Webhook sent successfully for upload %s", session.UploadID)
	return nil
}

func (m *MergeService) cleanup(uploadID string) {
	uploadDir := filepath.Join(m.cfg.UploadTmpDir, uploadID)

	// Remove parts directory
	partsDir := filepath.Join(uploadDir, "parts")
	if err := os.RemoveAll(partsDir); err != nil {
		log.Printf("Failed to cleanup parts for %s: %v", uploadID, err)
	}

	// Remove upload directory after some delay (in case of retry)
	time.AfterFunc(5*time.Minute, func() {
		if err := os.RemoveAll(uploadDir); err != nil {
			log.Printf("Failed to cleanup upload dir for %s: %v", uploadID, err)
		}
	})
}

func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	buffer := make([]byte, 8*1024*1024)
	_, err = io.CopyBuffer(destFile, sourceFile, buffer)
	if err != nil {
		return err
	}

	return destFile.Sync()
}
