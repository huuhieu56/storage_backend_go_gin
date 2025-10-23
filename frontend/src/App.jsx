import { useState } from 'react'
import VideoUploader from './components/VideoUploader'
import FileUploader from './components/FileUploader'
import VideoViewer from './components/VideoViewer'
import FileDownloader from './components/FileDownloader'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('video')

  return (
    <div className="app">
      <h1>LMS - Storage System</h1>
      
      <div className="tabs">
        <button 
          className={activeTab === 'video' ? 'active' : ''}
          onClick={() => setActiveTab('video')}
        >
          📤 Upload Video
        </button>
        <button 
          className={activeTab === 'file' ? 'active' : ''}
          onClick={() => setActiveTab('file')}
        >
          📤 Upload Material
        </button>
        <button 
          className={activeTab === 'viewer' ? 'active' : ''}
          onClick={() => setActiveTab('viewer')}
        >
          📺 View Video
        </button>
        <button 
          className={activeTab === 'downloader' ? 'active' : ''}
          onClick={() => setActiveTab('downloader')}
        >
          📥 Download File
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'video' && <VideoUploader />}
        {activeTab === 'file' && <FileUploader />}
        {activeTab === 'viewer' && <VideoViewer />}
        {activeTab === 'downloader' && <FileDownloader />}
      </div>
    </div>
  )
}

export default App
