package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"storage-backend/config"
	"time"
)

type AuthService struct {
	cfg *config.Config
}

func NewAuthService(cfg *config.Config) *AuthService {
	return &AuthService{cfg: cfg}
}

// VerifyLessonAccess calls main-backend internal API to verify user has access to lesson
// authToken is the JWT token from Authorization header (without "Bearer " prefix)
// lessonID is the lesson UUID string
func (a *AuthService) VerifyLessonAccess(authToken, lessonID string) error {
	url := fmt.Sprintf("%s/internal/auth/verify-lesson-access", a.cfg.MainBackendURL)

	payload := map[string]string{
		"lesson_id": lessonID,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal auth request: %w", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create auth request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", authToken))

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to call main-backend auth: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("🔐 Auth verification failed (401). lesson_id=%s body=%s", lessonID, string(body))
		return fmt.Errorf("authentication failed: %s", string(body))
	}

	if resp.StatusCode == 404 {
		log.Printf("🔍 Lesson not found during auth verification. lesson_id=%s", lessonID)
		return fmt.Errorf("lesson not found")
	}

	if resp.StatusCode == 403 {
		log.Printf("🚫 Access denied during auth verification. lesson_id=%s", lessonID)
		return fmt.Errorf("user does not have access to this lesson")
	}

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("⚠️ Unexpected auth response. status=%d lesson_id=%s body=%s", resp.StatusCode, lessonID, string(body))
		return fmt.Errorf("auth check failed with status %d: %s", resp.StatusCode, string(body))
	}

	log.Printf("✅ Auth verification succeeded. lesson_id=%s", lessonID)
	return nil
}
