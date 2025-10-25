import { useState } from 'react'

function FileViewer() {
  const [lessonId, setLessonId] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [filename, setFilename] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [error, setError] = useState('')

  const handleLoadFile = () => {
    if (!lessonId.trim()) {
      setError('Please enter a Lesson ID')
      return
    }

    if (!materialId.trim()) {
      setError('Please enter a Material ID')
      return
    }

    if (!filename.trim()) {
      setError('Please enter the filename')
      return
    }

    setError('')

    // Use relative URL - proxied through frontend Nginx to storage Nginx
    const url = `/materials/${lessonId.trim()}/${materialId.trim()}/${filename.trim()}`
    
    console.log('Loading file from:', url)
    setFileUrl(url)
  }

  const handleReset = () => {
    setLessonId('')
    setMaterialId('')
    setFilename('')
    setFileUrl('')
    setError('')
  }

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase()
    const iconMap = {
      pdf: '📄',
      doc: '📝',
      docx: '📝',
      xls: '📊',
      xlsx: '📊',
      ppt: '📊',
      pptx: '📊',
      zip: '📦',
      rar: '📦',
      jpg: '🖼️',
      jpeg: '🖼️',
      png: '🖼️',
      gif: '🖼️',
      txt: '📃',
      mp3: '🎵',
      mp4: '🎬',
    }
    return iconMap[ext] || '📁'
  }

  return (
    <div className="viewer-container">
      <h2>📁 File Viewer / Downloader</h2>
      <p className="subtitle">Download course materials via Nginx</p>

      <div className="form-group">
        <label htmlFor="lesson-id">Lesson ID *</label>
        <input
          id="lesson-id"
          type="text"
          value={lessonId}
          onChange={(e) => setLessonId(e.target.value)}
          placeholder="e.g., lesson-123"
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
        />
      </div>

      <div className="form-group">
        <label htmlFor="filename">Filename *</label>
        <input
          id="filename"
          type="text"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="e.g., lecture-notes.pdf"
          onKeyPress={(e) => e.key === 'Enter' && handleLoadFile()}
        />
        <small>The exact filename uploaded (including extension)</small>
      </div>

      {!fileUrl && (
        <div className="upload-actions">
          <button onClick={handleLoadFile}>
            Load File
          </button>
        </div>
      )}

      {fileUrl && (
        <div className="file-info-container">
          <div className="file-info">
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
              {getFileIcon(filename)}
            </div>
            <h3>{filename}</h3>
            <p><strong>Lesson:</strong> {lessonId}</p>
            <p><strong>Material:</strong> {materialId}</p>
            <p><strong>Download URL:</strong></p>
            <code style={{ 
              display: 'block', 
              padding: '8px', 
              background: '#f5f5f5', 
              borderRadius: '4px',
              wordBreak: 'break-all',
              marginTop: '8px'
            }}>
              {fileUrl}
            </code>
          </div>

          <div className="upload-actions">
            <a 
              href={fileUrl} 
              download 
              className="button"
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              📥 Download File
            </a>
            <button onClick={handleReset}>
              Load Another File
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
        <h3>ℹ️ How to download a file:</h3>
        <ol>
          <li>Upload a file/material using the File Uploader tab</li>
          <li>Enter the Lesson ID and Material ID you used during upload</li>
          <li>Enter the exact filename (with extension)</li>
          <li>Click "Load File" to get the download link</li>
        </ol>
        <p><strong>Supported formats:</strong> PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, ZIP, images, and more</p>
        <p><strong>Storage path:</strong> <code>/materials/&#123;lesson_id&#125;/&#123;material_id&#125;/&#123;filename&#125;</code></p>
      </div>
    </div>
  )
}

export default FileViewer
