/**
 * Simple Video Player - just stream the video
 * Browser handles buffering automatically based on network speed
 */
function OptimizedVideoPlayer({ src, onError }) {
  return (
    <div style={{ width: '100%' }}>
      <video
        controls
        preload="auto"
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
      
      <div style={{ 
        marginTop: '10px', 
        padding: '10px', 
        backgroundColor: '#f5f5f5', 
        borderRadius: '4px',
        fontSize: '14px'
      }}>
        <p style={{ margin: 0 }}>
          💡 Video streams automatically. Fast network = more buffering, slow network = less buffering.
        </p>
      </div>
    </div>
  )
}

export default OptimizedVideoPlayer
