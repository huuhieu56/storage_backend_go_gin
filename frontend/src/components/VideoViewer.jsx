import { useState } from 'react'
import OptimizedVideoPlayer from './OptimizedVideoPlayer'

function VideoViewer() {
  const [lessonId, setLessonId] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLoadVideo = () => {
    if (!lessonId.trim()) {
      setError('Please enter a Lesson ID')
      return
    }

    setError('')
    setLoading(true)

    // Use relative URL - proxied through frontend Nginx to storage Nginx
    const url = `/videos/${lessonId.trim()}/video.mp4`
    
    console.log('Loading video from:', url)
    setVideoUrl(url)
    setLoading(false)
  }

  const handleReset = () => {
    setLessonId('')
    setVideoUrl('')
    setError('')
  }

  return (
    <div className="viewer-container">
      <h2>📺 Video Viewer</h2>
      <p className="subtitle">Stream videos through Nginx</p>

      <div className="form-group">
        <label htmlFor="lesson-id">Lesson ID *</label>
        <input
          id="lesson-id"
          type="text"
          value={lessonId}
          onChange={(e) => setLessonId(e.target.value)}
          placeholder="e.g., lesson-123"
          disabled={loading}
          onKeyPress={(e) => e.key === 'Enter' && handleLoadVideo()}
        />
        <small>Enter the lesson ID to watch its video</small>
      </div>

      {!videoUrl && (
        <div className="upload-actions">
          <button onClick={handleLoadVideo}>
            Load Video
          </button>
        </div>
      )}

      {videoUrl && (
        <div className="video-player-container">
          <OptimizedVideoPlayer 
            src={videoUrl}
            onError={(e) => setError(`Failed to load video: ${e.message}`)}
          />

          <div className="video-info">
            <p><strong>Video URL:</strong></p>
            <code>{videoUrl}</code>
          </div>

          <div className="upload-actions">
            <button onClick={handleReset}>
              Load Another Video
            </button>
            <a 
              href={videoUrl} 
              download 
              className="button"
              style={{ textDecoration: 'none' }}
            >
              Download Video
            </a>
          </div>
        </div>
      )}

      {error && (
        <div className="error-message">
          <strong>✗ Error:</strong> {error}
        </div>
      )}

      <div className="help-section">
        <h3>ℹ️ How to watch a video:</h3>
        <ol>
          <li>Upload a video using the Video Uploader tab</li>
          <li>Enter the same Lesson ID you used during upload</li>
          <li>Click "Load Video" to start streaming</li>
          <li>Videos are served via Nginx with Range/206 support (seeking enabled)</li>
        </ol>
        <p><strong>Note:</strong> Videos are stored at <code>/videos/&#123;lesson_id&#125;/video.mp4</code></p>
      </div>
    </div>
  )
}

export default VideoViewer
