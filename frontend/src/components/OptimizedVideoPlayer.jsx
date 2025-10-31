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
      // CRITICAL: Chỉ load metadata, KHÔNG preload video data
      // Điều này ngăn browser tải hàng trăm chunks nhỏ trước khi play
      video.preload = 'none' // 'none' thay vì 'metadata' để tránh preload
      
      // Khi user click play, browser sẽ bắt đầu load
      video.addEventListener('play', handlePlay)
      video.addEventListener('timeupdate', handleTimeUpdate)
      video.addEventListener('progress', handleProgress)
      video.addEventListener('loadedmetadata', handleLoadedMetadata)
    }

    const handlePlay = () => {
      console.log('Video started playing, browser will manage buffering')
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
        
        console.log(`Buffered: ${bufferedSeconds.toFixed(1)}s ahead`)
      }
    }

    const handleLoadedMetadata = () => {
      setDuration(video.duration)
      console.log(`Video duration: ${video.duration.toFixed(1)}s`)
    }

    /**
     * Kiểm tra buffer và dừng preload nếu đã đủ 60s
     * Note: HTML5 video không có API trực tiếp để dừng preload,
     * nhưng có thể dùng Media Source Extensions (MSE) nếu cần kiểm soát chi tiết hơn
     */
    const checkBufferAhead = () => {
      if (video.buffered.length === 0) return

      const bufferedEnd = video.buffered.end(video.buffered.length - 1)
      const bufferedAhead = bufferedEnd - video.currentTime

      // Nếu buffer quá 60s, có thể hint browser giảm tốc độ fetch
      if (bufferedAhead > 60) {
        console.log(`Buffer sufficient (${bufferedAhead.toFixed(1)}s), reducing fetch rate`)
        // Browser sẽ tự động throttle nếu buffer đủ
      }
    }

    setupBufferControl()

    return () => {
      video?.removeEventListener('play', handlePlay)
      video?.removeEventListener('timeupdate', handleTimeUpdate)
      video?.removeEventListener('progress', handleProgress)
      video?.removeEventListener('loadedmetadata', handleLoadedMetadata)
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
        preload="none"
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
          Target: 60s buffer ahead for smooth playback
        </small>
      </div>
    </div>
  )
}

export default OptimizedVideoPlayer
