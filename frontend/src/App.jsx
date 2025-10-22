import { useState } from 'react'
import VideoUploader from './components/VideoUploader'
import FileUploader from './components/FileUploader'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('video')

  return (
    <div className="app">
      <h1>LMS - Upload System</h1>
      
      <div className="tabs">
        <button 
          className={activeTab === 'video' ? 'active' : ''}
          onClick={() => setActiveTab('video')}
        >
          Upload Video
        </button>
        <button 
          className={activeTab === 'file' ? 'active' : ''}
          onClick={() => setActiveTab('file')}
        >
          Upload Material
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'video' && <VideoUploader />}
        {activeTab === 'file' && <FileUploader />}
      </div>
    </div>
  )
}

export default App
