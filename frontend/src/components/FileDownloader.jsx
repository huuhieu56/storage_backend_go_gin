import { useState } from 'react'

function FileDownloader() {
  const [lessonId, setLessonId] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [fileName, setFileName] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handlePrepareDownload = () => {
    if (!lessonId.trim()) {
      setError('Please enter a Lesson ID')
      return
    }

    if (!materialId.trim()) {
      setError('Please enter a Material ID')
      return
    }

    if (!fileName.trim()) {
      setError('Please enter the file name')
      return
    }

    setError('')
    setLoading(true)

    // Use relative URL - proxied through frontend Nginx to storage Nginx
    const url = `/materials/${lessonId.trim()}/${materialId.trim()}/${fileName.trim()}`
    
    setDownloadUrl(url)
    setLoading(false)
  }

  const handleReset = () => {
    setLessonId('')
    setMaterialId('')
    setFileName('')
    setDownloadUrl('')
    setError('')
  }

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank')
    }
  }

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase()
    const icons = {
      pdf: '📄',
      doc: '📝',
      docx: '📝',
      ppt: '📊',
      pptx: '📊',
      xls: '📈',
      xlsx: '📈',
      zip: '📦',
      rar: '📦',
      jpg: '🖼️',
      jpeg: '🖼️',
      png: '🖼️',
      gif: '🖼️',
      mp4: '🎬',
      mp3: '🎵',
      txt: '📃',
    }
    return icons[ext] || '📎'
  }

  return (
    <div className="viewer-container">
      <h2>📥 File Downloader</h2>
      <p className="subtitle">Download materials through Nginx</p>

      <div className="form-group">
        <label htmlFor="lesson-id">Lesson ID *</label>
        <input
          id="lesson-id"
          type="text"
          value={lessonId}
          onChange={(e) => setLessonId(e.target.value)}
          placeholder="e.g., lesson-123"
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="material-id">Material ID *</label>
        <input
          id="material-id"
          type="text"
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
          placeholder="e.g., material-456"
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="file-name">File Name *</label>
        <input
          id="file-name"
          type="text"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          placeholder="e.g., lecture-notes.pdf"
          disabled={loading}
        />
        <small>Include the file extension (e.g., .pdf, .docx)</small>
      </div>

      {!downloadUrl && (
        <div className="upload-actions">
          <button onClick={handlePrepareDownload}>
            Prepare Download
          </button>
        </div>
      )}

      {downloadUrl && (
        <div className="download-container">
          <div className="file-preview">
            <div className="file-icon">
              {getFileIcon(fileName)}
            </div>
            <div className="file-details">
              <h3>{fileName}</h3>
              <p><strong>Location:</strong></p>
              <code>{downloadUrl}</code>
            </div>
          </div>

          <div className="upload-actions">
            <button onClick={handleDownload} className="primary">
              📥 Download Now
            </button>
            <button onClick={handleReset}>
              Download Another File
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="error-message">
          <strong>✗ Error:</strong> {error}
        </div>
      )}

      <div className="help-section">
        <h3>ℹ️ How to find your files:</h3>
        <ol>
          <li>Upload a file using the File Uploader</li>
          <li>Note the Lesson ID and Material ID you used</li>
          <li>Remember the original filename</li>
          <li>Enter those details here to download</li>
        </ol>
        <p><strong>Supported files:</strong> PDF, DOC, DOCX, PPT, PPTX, images, archives, and more!</p>
      </div>
    </div>
  )
}

export default FileDownloader
