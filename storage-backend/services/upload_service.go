package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"storage-backend/config"
	"storage-backend/models"
	"sync"
	"time"

	"github.com/google/uuid"
)

type UploadService struct {
	cfg              *config.Config
	sessions         map[string]*models.UploadSession
	mu               sync.RWMutex
	activeConcurrent int
	concurrentMu     sync.Mutex
	writeQueue       chan writeJob
}

type writeJob struct {
	path string
	data []byte
	done chan error
}

func NewUploadService(cfg *config.Config) *UploadService {
	svc := &UploadService{
		cfg:        cfg,
		sessions:   make(map[string]*models.UploadSession),
		writeQueue: make(chan writeJob, cfg.WriteQueueSize),
	}
	
	// Start async file writers from config
	log.Printf("Starting %d file writer workers (configurable via FILE_WRITE_WORKERS)", cfg.FileWriteWorkers)
	
	for i := 0; i < cfg.FileWriteWorkers; i++ {
		go svc.fileWriter(i)
	}
	
	return svc
}

// fileWriter processes file writes asynchronously
func (s *UploadService) fileWriter(workerID int) {
	log.Printf("💾 File writer worker %d started", workerID)
	for job := range s.writeQueue {
		// Write with optimized flags for speed
		// Create file with larger permissions
		file, err := os.OpenFile(job.path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
		if err != nil {
			job.done <- err
			close(job.done)
			continue
		}
		
		// Write in one go for maximum speed
		_, err = file.Write(job.data)
		file.Close() // Don't fsync for speed (risk: data loss on crash)
		
		job.done <- err
		close(job.done)
	}
}

func (s *UploadService) CanAcceptUpload() bool {
	s.concurrentMu.Lock()
	defer s.concurrentMu.Unlock()
	return s.activeConcurrent < s.cfg.MaxConcurrent
}

func (s *UploadService) IncrementActive() {
	s.concurrentMu.Lock()
	defer s.concurrentMu.Unlock()
	s.activeConcurrent++
}

func (s *UploadService) DecrementActive() {
	s.concurrentMu.Lock()
	defer s.concurrentMu.Unlock()
	if s.activeConcurrent > 0 {
		s.activeConcurrent--
	}
}

func (s *UploadService) CreateSession(req *models.InitUploadRequest, uploadType models.UploadType) (*models.UploadSession, error) {
	if !s.CanAcceptUpload() {
		return nil, fmt.Errorf("too many concurrent uploads, please retry later")
	}

	uploadID := uuid.New().String()
	uploadToken := generateToken()
	
	totalParts := int(math.Ceil(float64(req.Size) / float64(s.cfg.ChunkSize)))

	session := &models.UploadSession{
		UploadID:      uploadID,
		LessonID:      req.LessonID,
		MaterialID:    req.MaterialID,
		Type:          uploadType,
		Filename:      req.Filename,
		ContentType:   req.ContentType,
		ExpectedSize:  req.Size,
		ReceivedBytes: 0,
		Status:        models.StatusInitiated,
		UploadToken:   uploadToken,
		PartsReceived: make(map[int]bool),
		TotalParts:    totalParts,
		CreatedAt:     time.Now(),
	}

	// Create upload directory
	uploadDir := s.getUploadDir(uploadID)
	if err := os.MkdirAll(filepath.Join(uploadDir, "parts"), 0755); err != nil {
		return nil, fmt.Errorf("failed to create upload directory: %w", err)
	}

	s.mu.Lock()
	s.sessions[uploadID] = session
	s.mu.Unlock()

	s.IncrementActive()

	log.Printf("Created upload session %s for lesson %s, size: %d bytes, parts: %d", 
		uploadID[:8], req.LessonID, req.Size, totalParts)

	return session, nil
}

func (s *UploadService) GetSession(uploadID string) (*models.UploadSession, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	session, exists := s.sessions[uploadID]
	if !exists {
		return nil, fmt.Errorf("upload session not found")
	}

	// Return a COPY to avoid race conditions when caller reads fields
	sessionCopy := &models.UploadSession{
		UploadID:      session.UploadID,
		LessonID:      session.LessonID,
		MaterialID:    session.MaterialID,
		Type:          session.Type,
		Filename:      session.Filename,
		ContentType:   session.ContentType,
		ExpectedSize:  session.ExpectedSize,
		ReceivedBytes: session.ReceivedBytes,
		Status:        session.Status,
		UploadToken:   session.UploadToken,
		TotalParts:    session.TotalParts,
		CreatedAt:     session.CreatedAt,
		CompletedAt:   session.CompletedAt,
		Error:         session.Error,
		OutputPath:    session.OutputPath,
	}

	return sessionCopy, nil
}

func (s *UploadService) ValidateToken(uploadID, token string) error {
	session, err := s.GetSession(uploadID)
	if err != nil {
		return err
	}

	if session.UploadToken != token {
		return fmt.Errorf("invalid upload token")
	}

	return nil
}

// GetUploadedParts returns list of part numbers that have been successfully uploaded
// This enables resumable uploads - client can skip already uploaded parts
func (s *UploadService) GetUploadedParts(uploadID string) ([]int, error) {
	s.mu.RLock()
	session, exists := s.sessions[uploadID]
	s.mu.RUnlock()
	
	if !exists {
		return nil, fmt.Errorf("upload session not found")
	}

	// Check which part files actually exist on disk
	uploadDir := s.getUploadDir(uploadID)
	partsDir := filepath.Join(uploadDir, "parts")
	
	var uploadedParts []int
	
	// Read lock while checking PartsReceived map
	s.mu.RLock()
	for partNum := range session.PartsReceived {
		// Double-check file exists on disk
		partPath := filepath.Join(partsDir, fmt.Sprintf("part-%d", partNum))
		if _, err := os.Stat(partPath); err == nil {
			uploadedParts = append(uploadedParts, partNum)
		}
	}
	s.mu.RUnlock()

	log.Printf("Upload %s: Found %d/%d parts already uploaded (resumable)", 
		uploadID[:8], len(uploadedParts), session.TotalParts)

	return uploadedParts, nil
}

func (s *UploadService) SavePart(uploadID string, partNum int, data []byte) error {
	// Make a copy of data since it might be from a pooled buffer
	dataCopy := make([]byte, len(data))
	copy(dataCopy, data)
	
	// Queue async write
	partPath := s.getPartPath(uploadID, partNum)
	job := writeJob{
		path: partPath,
		data: dataCopy,
		done: make(chan error, 1),
	}
	
	// Send to write queue (non-blocking if queue has space)
	select {
	case s.writeQueue <- job:
		// Queued successfully
	default:
		// Queue full, write synchronously as fallback
		if err := os.WriteFile(partPath, dataCopy, 0644); err != nil {
			return fmt.Errorf("failed to write part: %w", err)
		}
		goto updateSession
	}
	
	// Wait for write to complete
	if err := <-job.done; err != nil {
		return fmt.Errorf("failed to write part: %w", err)
	}

updateSession:
	// Update session - MUST lock before accessing session
	s.mu.Lock()
	defer s.mu.Unlock()

	session, exists := s.sessions[uploadID]
	if !exists {
		return fmt.Errorf("upload session not found")
	}

	// Check if already received (idempotent)
	if session.PartsReceived[partNum] {
		return nil
	}

	// Update session data
	session.PartsReceived[partNum] = true
	session.ReceivedBytes += int64(len(dataCopy))
	if session.Status == models.StatusInitiated {
		session.Status = models.StatusReceiving
	}

	// Log progress every 10 parts to reduce log spam
	if partNum%10 == 0 || partNum == session.TotalParts {
		progress := float64(session.ReceivedBytes) / float64(session.ExpectedSize) * 100
		log.Printf("📦 Upload %s: part %d/%d received, progress: %.1f%%", 
			uploadID[:8], partNum, session.TotalParts, progress)
	}

	return nil
}

func (s *UploadService) MarkComplete(uploadID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, exists := s.sessions[uploadID]
	if !exists {
		return fmt.Errorf("upload session not found")
	}

	// Verify all parts received
	for i := 1; i <= session.TotalParts; i++ {
		if !session.PartsReceived[i] {
			return fmt.Errorf("missing part %d", i)
		}
	}

	session.Status = models.StatusUploaded

	s.DecrementActive()

	return nil
}

func (s *UploadService) UpdateStatus(uploadID string, status models.UploadStatus, errorMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if session, exists := s.sessions[uploadID]; exists {
		session.Status = status
		if errorMsg != "" {
			session.Error = errorMsg
		}
		if status == models.StatusReady || status == models.StatusFailed {
			now := time.Now()
			session.CompletedAt = &now
		}
	}
}

func (s *UploadService) SetOutputPath(uploadID, path string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if session, exists := s.sessions[uploadID]; exists {
		session.OutputPath = path
	}
}

func (s *UploadService) getUploadDir(uploadID string) string {
	return filepath.Join(s.cfg.UploadTmpDir, uploadID)
}

func (s *UploadService) getPartPath(uploadID string, partNum int) string {
	return filepath.Join(s.getUploadDir(uploadID), "parts", fmt.Sprintf("part-%d", partNum))
}

func (s *UploadService) GetUploadDir(uploadID string) string {
	return s.getUploadDir(uploadID)
}

func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}
