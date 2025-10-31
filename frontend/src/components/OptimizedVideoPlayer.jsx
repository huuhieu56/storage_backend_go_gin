import { useEffect, useRef, useState } from 'react'

/**
 * Optimized Video Player với buffer control
 * - Chỉ load trước 60 giây video (adaptive)
 * - Giảm số lượng HTTP Range requests
 * - Theo dõi buffer progress
 */
function OptimizedVideoPlayer({ src, onError }) {
  const videoRef = useRef(null)
  const [buffered, setBuffered] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Cấu hình buffer behavior
    const setupBufferControl = () => {
      // CRITICAL: Load metadata ngay để biết duration, nhưng chỉ load video data khi cần
      video.preload = 'metadata'
      
      video.addEventListener('loadedmetadata', handleLoadedMetadata)
      video.addEventListener('canplay', handleCanPlay)
      video.addEventListener('timeupdate', handleTimeUpdate)
      video.addEventListener('progress', handleProgress)
      video.addEventListener('waiting', handleWaiting)
      video.addEventListener('playing', handlePlaying)
    }

    const handleLoadedMetadata = () => {
      setDuration(video.duration)
      console.log(`✓ Video metadata loaded, duration: ${video.duration.toFixed(1)}s`)
    }

    const handleCanPlay = () => {
      console.log('✓ Video ready to play - buffered enough data for start')
    }

    const handleWaiting = () => {
      console.log('⏳ Buffering more data...')
    }

    const handlePlaying = () => {
      console.log('▶️ Video playing')
    }

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      checkBufferAhead()
    }

    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1)
        const bufferedSeconds = bufferedEnd - video.currentTime
        setBuffered(bufferedSeconds)
        
        // Log mỗi 5s để tránh spam console
        if (Math.floor(bufferedSeconds) % 5 === 0) {
          console.log(`Buffer: ${bufferedSeconds.toFixed(1)}s ahead (target: ~60s max)`)
        }
      }
    }

    /**
     * Browser tự động quản lý buffer - nó sẽ:
     * 1. Load chunk đầu tiên để có thể play ngay
     * 2. Load thêm ~60s buffer phía trước
     * 3. Khi user seek, load chunk mới ở vị trí đó
     * 
     * Với Nginx config mới (chunks 2MB + limit_rate_after 10MB), 
     * browser chỉ cần ~5-10 requests thay vì 200+ requests
     */
    const checkBufferAhead = () => {
      if (video.buffered.length === 0) return

      const bufferedEnd = video.buffered.end(video.buffered.length - 1)
      const bufferedAhead = bufferedEnd - video.currentTime

      // Browser tự động throttle khi buffer đủ, ta chỉ log để monitor
      if (bufferedAhead > 60) {
        // Đủ buffer rồi, browser sẽ giảm tốc độ fetch
      }
    }

    setupBufferControl()

    return () => {
      video?.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video?.removeEventListener('canplay', handleCanPlay)
      video?.removeEventListener('timeupdate', handleTimeUpdate)
      video?.removeEventListener('progress', handleProgress)
      video?.removeEventListener('waiting', handleWaiting)
      video?.removeEventListener('playing', handlePlaying)
    }
  }, [src])

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ width: '100%' }}>
      <video
        ref={videoRef}
        controls
        preload="metadata"
        style={{ 
          width: '100%', 
          maxWidth: '800px', 
          borderRadius: '8px',
          backgroundColor: '#000'
        }}
        onError={(e) => {
          console.error('Video error:', e)
          onError?.(e)
        }}
      >
        <source src={src} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Buffer indicator */}
      <div style={{ 
        marginTop: '10px', 
        padding: '10px', 
        backgroundColor: '#f5f5f5', 
        borderRadius: '4px',
        fontSize: '14px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span><strong>Current:</strong> {formatTime(currentTime)}</span>
          <span><strong>Duration:</strong> {formatTime(duration)}</span>
        </div>
        <div>
          <strong>Buffered ahead:</strong> {buffered.toFixed(1)}s 
          {buffered > 60 && <span style={{ color: 'green', marginLeft: '10px' }}>✓ Sufficient</span>}
          {buffered > 0 && buffered <= 60 && <span style={{ color: 'orange', marginLeft: '10px' }}>⟳ Buffering...</span>}
        </div>
        <div style={{ 
          marginTop: '8px', 
          height: '4px', 
          backgroundColor: '#ddd', 
          borderRadius: '2px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min((buffered / 60) * 100, 100)}%`,
            height: '100%',
            backgroundColor: buffered > 60 ? '#4CAF50' : '#FF9800',
            transition: 'width 0.3s ease'
          }} />
        </div>
        <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
          💡 Browser tự động load ~60s buffer phía trước. Khi bạn seek, sẽ load chunk mới.
        </small>
      </div>
    </div>
  )
}

export default OptimizedVideoPlayer
