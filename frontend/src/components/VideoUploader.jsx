import { useState, useRef } from 'react'
import ChunkedUploader from '../services/uploader'

function VideoUploader() {
  const [lessonId, setLessonId] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentPart, setCurrentPart] = useState(0)
  const [totalParts, setTotalParts] = useState(0)
  const [status, setStatus] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  
  const uploaderRef = useRef(null)
  const fileInputRef = useRef(null)

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Validate file type
      if (file.type !== 'video/mp4') {
        setError('Only MP4 video files are supported')
        return
      }
      
      setSelectedFile(file)
      setError('')
      setSuccess(false)
      setProgress(0)
      setStatus('')
    }
  }

  const handleUpload = async () => {
    if (!lessonId.trim()) {
      setError('Please enter a Lesson ID')
      return
    }

    if (!selectedFile) {
      setError('Please select a video file')
      return
    }

    setUploading(true)
    setError('')
    setSuccess(false)
    setProgress(0)

    const uploader = new ChunkedUploader(
      selectedFile,
      lessonId.trim(),
      null, // No material ID for videos
      // Progress callback
      (progressPercent, part, total) => {
        setProgress(progressPercent)
        setCurrentPart(part)
        setTotalParts(total)
      },
      // Status callback
      (newStatus, message) => {
        setStatus(newStatus)
        setStatusMessage(message)
      }
    )

    uploaderRef.current = uploader

    const result = await uploader.start()

    setUploading(false)

    if (result.success) {
      setSuccess(true)
      setProgress(100)
    } else {
      setError(result.message || 'Upload failed')
    }
  }

  const handleReset = () => {
    setSelectedFile(null)
    setProgress(0)
    setStatus('')
    setStatusMessage('')
    setError('')
    setSuccess(false)
    setCurrentPart(0)
    setTotalParts(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="uploader-container">
      <h2>Upload Video</h2>
      
      <div className="form-group">
        <label htmlFor="lesson-id">Lesson ID *</label>
        <input
          id="lesson-id"
          type="text"
          value={lessonId}
          onChange={(e) => setLessonId(e.target.value)}
          placeholder="Enter lesson ID"
          disabled={uploading}
        />
      </div>

      <div className="file-selector">
        <input
          ref={fileInputRef}
          type="file"
          id="video-file"
          accept="video/mp4"
          onChange={handleFileSelect}
          disabled={uploading}
        />
        <label htmlFor="video-file" className="file-input-label">
          Choose Video File
        </label>
        
        {selectedFile && (
          <div className="selected-file">
            {selectedFile.name} ({formatFileSize(selectedFile.size)})
          </div>
        )}
      </div>

      {selectedFile && !uploading && !success && (
        <div className="upload-actions">
          <button onClick={handleUpload}>
            Start Upload
          </button>
          <button onClick={handleReset}>
            Clear
          </button>
        </div>
      )}

      {uploading && (
        <div className="progress-container">
          <div className="progress-info">
            <span>Uploading...</span>
            <span>{currentPart} / {totalParts} parts</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress}%` }}
            >
              {progress.toFixed(1)}%
            </div>
          </div>
          {status && (
            <div className={`status-badge status-${status}`}>
              {statusMessage}
            </div>
          )}
        </div>
      )}

      {success && (
        <div className="success-message">
          <strong>✓ Success!</strong> Video uploaded successfully and is ready to use.
          <div className="upload-actions">
            <button onClick={handleReset}>
              Upload Another Video
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="error-message">
          <strong>✗ Error:</strong> {error}
        </div>
      )}
    </div>
  )
}

export default VideoUploader
