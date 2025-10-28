package models

import "time"

type UploadStatus string

const (
	StatusInitiated UploadStatus = "initiated"
	StatusReceiving UploadStatus = "receiving"
	StatusUploaded  UploadStatus = "uploaded"
	StatusMerging   UploadStatus = "merging"
	StatusReady     UploadStatus = "ready"
	StatusFailed    UploadStatus = "failed"
)

type UploadType string

const (
	TypeVideo    UploadType = "video"
	TypeMaterial UploadType = "material"
)

type UploadSession struct {
	UploadID      string       `json:"upload_id"`
	LessonID      string       `json:"lesson_id"`
	Type          UploadType   `json:"type"`
	Filename      string       `json:"filename"`
	ContentType   string       `json:"content_type"`
	ExpectedSize  int64        `json:"expected_size"`
	ReceivedBytes int64        `json:"received_bytes"`
	Status        UploadStatus `json:"status"`
	UploadToken   string       `json:"upload_token"`
	PartsReceived map[int]bool `json:"-"`
	TotalParts    int          `json:"total_parts"`
	CreatedAt     time.Time    `json:"created_at"`
	CompletedAt   *time.Time   `json:"completed_at,omitempty"`
	Error         string       `json:"error,omitempty"`
	OutputPath    string       `json:"output_path,omitempty"`
}

type InitUploadRequest struct {
	LessonID    string `json:"lesson_id" binding:"required"`
	Filename    string `json:"filename" binding:"required"`
	Size        int64  `json:"size" binding:"required"`
	ContentType string `json:"content_type"` // Optional - defaults to application/octet-stream if empty
}

type InitUploadResponse struct {
	UploadID    string `json:"upload_id"`
	UploadToken string `json:"upload_token"`
	ChunkSize   int64  `json:"chunk_size"`
	PutURL      string `json:"put_url"`
}

type CompleteUploadResponse struct {
	Status string `json:"status"`
}

type UploadStatusResponse struct {
	UploadID      string       `json:"upload_id"`
	Status        UploadStatus `json:"status"`
	ReceivedBytes int64        `json:"received_bytes"`
	ExpectedBytes int64        `json:"expected_bytes"`
	Progress      float64      `json:"progress"`
	Error         string       `json:"error,omitempty"`
}

type VideoReadyWebhook struct {
	LessonID          string `json:"lesson_id"`
	VideoURL          string `json:"video_url"`
	DurationInSeconds int    `json:"duration_in_seconds,omitempty"`
	TranscriptURL     string `json:"transcript_url,omitempty"`
}

type FileReadyWebhook struct {
	LessonID    string `json:"lesson_id"`
	MaterialID  string `json:"material_id"`
	FileURL     string `json:"file_url"`
	Filename    string `json:"filename"`
	SizeBytes   int64  `json:"size_bytes,omitempty"`
	ContentType string `json:"content_type,omitempty"`
}
