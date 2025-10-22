import { useState, useRef } from 'react'
import ChunkedUploader from '../services/uploader'

function FileUploader() {
  const [lessonId, setLessonId] = useState('')
  const [materialId, setMaterialId] = useState('')
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

  // REMOVED: No file type restrictions - accept all file types
  // Users can upload any file: PDF, DOC, ZIP, RAR, images, videos, etc.

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
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

    if (!materialId.trim()) {
      setError('Please enter a Material ID')
      return
    }

    if (!selectedFile) {
      setError('Please select a file')
      return
    }

    setUploading(true)
    setError('')
    setSuccess(false)
    setProgress(0)

    const uploader = new ChunkedUploader(
      selectedFile,
      lessonId.trim(),
      materialId.trim(),
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
      <h2>Upload Material</h2>
      
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

      <div className="form-group">
        <label htmlFor="material-id">Material ID *</label>
        <input
          id="material-id"
          type="text"
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
          placeholder="Enter material ID"
          disabled={uploading}
        />
      </div>

      <div className="file-selector">
        <input
          ref={fileInputRef}
          type="file"
          id="material-file"
          onChange={handleFileSelect}
          disabled={uploading}
        />
        <label htmlFor="material-file" className="file-input-label">
          Choose Any File
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
          <strong>✓ Success!</strong> Material uploaded successfully and is ready to use.
          <div className="upload-actions">
            <button onClick={handleReset}>
              Upload Another File
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

export default FileUploader
