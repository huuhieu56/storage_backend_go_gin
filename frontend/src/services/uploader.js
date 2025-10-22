import axios from 'axios';

// Use environment variable or default to current host
const STORAGE_API_URL = import.meta.env.VITE_STORAGE_API_URL || 
                        `http://${window.location.hostname}:8080`;
const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB

export class ChunkedUploader {
  constructor(file, lessonId, materialId = null, onProgress = null, onStatusChange = null) {
    this.file = file;
    this.lessonId = lessonId;
    this.materialId = materialId;
    this.onProgress = onProgress;
    this.onStatusChange = onStatusChange;
    this.uploadId = null;
    this.uploadToken = null;
    this.aborted = false;
    this.uploadedParts = new Set(); // Track uploaded parts for resume
  }

  // Save upload state to localStorage for browser refresh recovery
  saveState() {
    if (!this.uploadId) return;
    
    const state = {
      uploadId: this.uploadId,
      uploadToken: this.uploadToken,
      fileName: this.file.name,
      fileSize: this.file.size,
      lessonId: this.lessonId,
      materialId: this.materialId,
      uploadedParts: Array.from(this.uploadedParts),
      timestamp: Date.now()
    };
    
    localStorage.setItem(`upload_${this.uploadId}`, JSON.stringify(state));
  }

  // Restore upload state from localStorage
  static restoreState(uploadId) {
    const stateStr = localStorage.getItem(`upload_${uploadId}`);
    if (!stateStr) return null;
    
    try {
      const state = JSON.parse(stateStr);
      // Check if state is not too old (24 hours)
      if (Date.now() - state.timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(`upload_${uploadId}`);
        return null;
      }
      return state;
    } catch (e) {
      return null;
    }
  }

  // Clear saved state after successful upload
  clearState() {
    if (this.uploadId) {
      localStorage.removeItem(`upload_${this.uploadId}`);
    }
  }

  // Check which parts are already uploaded (for resume)
  async checkUploadedParts() {
    if (!this.uploadId || !this.uploadToken) {
      return [];
    }

    try {
      const url = `${STORAGE_API_URL}/uploads/${this.uploadId}/parts`;
      const response = await axios.get(url, {
        headers: {
          'X-Upload-Token': this.uploadToken,
        }
      });
      
      const uploadedParts = response.data.uploaded_parts || [];
      console.log(`📦 Resume: Found ${uploadedParts.length}/${response.data.total_parts} parts already uploaded`);
      
      // Update uploaded parts set
      uploadedParts.forEach(partNum => this.uploadedParts.add(partNum));
      
      return uploadedParts;
    } catch (error) {
      console.error('Failed to check uploaded parts:', error);
      return [];
    }
  }

  async start(resumeUploadId = null) {
    try {
      // Try to resume existing upload
      if (resumeUploadId) {
        const savedState = ChunkedUploader.restoreState(resumeUploadId);
        if (savedState && savedState.fileSize === this.file.size) {
          console.log('🔄 Resuming upload:', resumeUploadId);
          this.uploadId = savedState.uploadId;
          this.uploadToken = savedState.uploadToken;
          
          // Check which parts are already uploaded
          await this.checkUploadedParts();
          
          if (this.onStatusChange) {
            this.onStatusChange('receiving', `Resuming upload... (${this.uploadedParts.size} parts already uploaded)`);
          }
          
          // Continue from where we left off
          await this.uploadChunks();
          await this.completeUpload();
          
          if (this.onStatusChange) {
            this.onStatusChange('processing', 'Processing upload...');
          }
          
          await this.pollStatus();
          this.clearState();
          
          return { success: true, uploadId: this.uploadId, resumed: true };
        }
      }
      
      // Step 1: Initialize upload
      const initResponse = await this.initUpload();
      this.uploadId = initResponse.upload_id;
      this.uploadToken = initResponse.upload_token;
      
      // Save state for resume capability
      this.saveState();
      
      if (this.onStatusChange) {
        this.onStatusChange('initiated', 'Upload session created');
      }

      // Step 2: Upload chunks
      await this.uploadChunks();

      if (this.aborted) {
        return { success: false, message: 'Upload aborted' };
      }

      // Step 3: Complete upload
      await this.completeUpload();

      if (this.onStatusChange) {
        this.onStatusChange('processing', 'Processing upload...');
      }

      // Step 4: Poll for status
      await this.pollStatus();
      
      // Clear saved state on success
      this.clearState();

      return { success: true, uploadId: this.uploadId };
    } catch (error) {
      console.error('Upload error:', error);
      if (this.onStatusChange) {
        this.onStatusChange('failed', error.message || 'Upload failed');
      }
      return { success: false, message: error.message };
    }
  }

  async initUpload() {
    const endpoint = this.materialId ? '/uploads/files' : '/uploads/videos';
    
    const payload = {
      lesson_id: this.lessonId,
      filename: this.file.name,
      size: this.file.size,
      // Use file type or default to application/octet-stream for unknown types
      content_type: this.file.type || 'application/octet-stream',
    };

    if (this.materialId) {
      payload.material_id = this.materialId;
    }

    const response = await axios.post(`${STORAGE_API_URL}${endpoint}`, payload, {
      headers: {
        'Content-Type': 'application/json',
        // TODO: Add JWT token when authentication is implemented
        // 'Authorization': `Bearer ${token}`
      }
    });

    return response.data;
  }

  async uploadChunks() {
    const totalChunks = Math.ceil(this.file.size / CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      if (this.aborted) {
        break;
      }

      const partNum = i + 1;
      
      // RESUME LOGIC: Skip parts that are already uploaded
      if (this.uploadedParts.has(partNum)) {
        console.log(`⏭️  Skipping part ${partNum}/${totalChunks} (already uploaded)`);
        
        // Still update progress AND status
        const progress = ((i + 1) / totalChunks) * 100;
        if (this.onProgress) {
          this.onProgress(progress, i + 1, totalChunks);
        }
        
        if (this.onStatusChange) {
          this.onStatusChange('receiving', `Skipping part ${partNum}/${totalChunks} (already uploaded)`);
        }
        
        continue;
      }

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, this.file.size);
      const chunk = this.file.slice(start, end);
      
      await this.uploadPart(partNum, chunk);
      
      // Mark part as uploaded and save state
      this.uploadedParts.add(partNum);
      this.saveState();
      
      // Update progress
      const progress = ((i + 1) / totalChunks) * 100;
      if (this.onProgress) {
        this.onProgress(progress, i + 1, totalChunks);
      }

      // Update status message EVERY chunk, not just first one
      if (this.onStatusChange) {
        this.onStatusChange('receiving', `Uploading part ${partNum}/${totalChunks}`);
      }
    }
  }

  async uploadPart(partNum, chunk) {
    const url = `${STORAGE_API_URL}/uploads/${this.uploadId}/parts/${partNum}`;
    
    // Don't set Content-Length - browser will set it automatically
    // Setting it manually causes "Refused to set unsafe header" error
    await axios.put(url, chunk, {
      headers: {
        'X-Upload-Token': this.uploadToken,
        'Content-Type': 'application/octet-stream',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 60000, // 60 second timeout per chunk
    });
  }

  async completeUpload() {
    const url = `${STORAGE_API_URL}/uploads/${this.uploadId}/complete`;
    
    await axios.post(url, {}, {
      headers: {
        'X-Upload-Token': this.uploadToken,
      }
    });
  }

  async pollStatus() {
    const maxAttempts = 120; // 10 minutes with 5 second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      if (this.aborted) {
        break;
      }

      const status = await this.getStatus();
      
      if (this.onStatusChange) {
        this.onStatusChange(status.status, this.getStatusMessage(status.status));
      }

      if (status.status === 'ready') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'Upload failed during processing');
      }

      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('Upload processing timeout');
  }

  async getStatus() {
    const url = `${STORAGE_API_URL}/uploads/${this.uploadId}/status`;
    const response = await axios.get(url);
    return response.data;
  }

  getStatusMessage(status) {
    const messages = {
      'initiated': 'Upload session created',
      'receiving': 'Uploading chunks...',
      'uploaded': 'All chunks uploaded',
      'merging': 'Merging file parts...',
      'ready': 'Upload complete! File is ready.',
      'failed': 'Upload failed'
    };
    return messages[status] || status;
  }

  abort() {
    this.aborted = true;
  }
}

export default ChunkedUploader;
