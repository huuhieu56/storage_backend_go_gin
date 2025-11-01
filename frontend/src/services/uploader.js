import axios from 'axios';

// Check if we should use proxy (local dev) or relative URL (docker)
const USE_PROXY = import.meta.env.VITE_USE_PROXY === 'true';

// Use relative URL for Docker (proxied by Nginx) or /api for local dev (proxied by Vite)
const STORAGE_API_URL = USE_PROXY ? '/api' : '/api';

const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB
const CHUNK_TIMEOUT = 5 * 60 * 1000; // 5 minute timeout per chunk để tránh ngắt khi mạng chậm
const CHUNK_MAX_RETRIES = 3; // Số lần thử lại tối đa cho mỗi chunk
const RETRY_BASE_DELAY = 3000; // Đợi 3 giây trước khi thử lại, tăng dần theo số lần

console.log('🔧 Storage API Config:', {
  USE_PROXY,
  STORAGE_API_URL,
  mode: import.meta.env.MODE
});

export class ChunkedUploader {
  constructor(file, lessonId, uploadType = 'video', onProgress = null, onStatusChange = null, jwtToken = null) {
    this.file = file;
    this.lessonId = lessonId;
    this.uploadType = uploadType;
    this.onProgress = onProgress;
    this.onStatusChange = onStatusChange;
    this.jwtToken = jwtToken; // JWT token for authentication
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
      uploadType: this.uploadType,
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
        if (savedState && savedState.fileSize === this.file.size && savedState.uploadType === this.uploadType) {
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
      
      // Better error messages for auth failures
      let errorMessage = error.message || 'Upload failed';
      
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 401) {
          errorMessage = '🔒 Authentication failed: ' + (data.error || 'Invalid or expired JWT token');
        } else if (status === 403) {
          errorMessage = '🚫 Access denied: ' + (data.error || 'You don\'t have permission to upload to this lesson');
        } else if (status === 404) {
          errorMessage = '❌ Not found: ' + (data.error || 'Lesson not found');
        } else if (data.error) {
          errorMessage = data.error;
        }
      }
      
      if (this.onStatusChange) {
        this.onStatusChange('failed', errorMessage);
      }
      return { success: false, message: errorMessage };
    }
  }

  async initUpload() {
    const endpoint = this.uploadType === 'material' ? '/uploads/files' : '/uploads/videos';
    
    const payload = {
      lesson_id: this.lessonId,
      filename: this.file.name,
      size: this.file.size,
      // Use file type or default to application/octet-stream for unknown types
      content_type: this.file.type || 'application/octet-stream',
    };

    // Build headers
    const headers = {
      'Content-Type': 'application/json',
    };

    // Add JWT token if provided
    if (this.jwtToken) {
      headers['Authorization'] = `Bearer ${this.jwtToken}`;
    }

    const response = await axios.post(`${STORAGE_API_URL}${endpoint}`, payload, {
      headers: headers
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
    let attempt = 0;

    while (attempt < CHUNK_MAX_RETRIES) {
      try {
        // Don't set Content-Length - browser will set it automatically
        // Setting it manually causes "Refused to set unsafe header" error
        await axios.put(url, chunk, {
          headers: {
            'X-Upload-Token': this.uploadToken,
            'Content-Type': 'application/octet-stream',
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: CHUNK_TIMEOUT,
        });
        return;
      } catch (error) {
        attempt += 1;

        const status = error?.response?.status;
        const isTimeoutError = error.code === 'ECONNABORTED';
        const isNetworkError = !error.response;
        const isRetryableHttp = status === 408 || (status >= 500 && status < 600);
        const shouldRetry = (isTimeoutError || isNetworkError || isRetryableHttp) && attempt < CHUNK_MAX_RETRIES;

        if (!shouldRetry) {
          throw error;
        }

        const delay = RETRY_BASE_DELAY * attempt;
        if (this.onStatusChange) {
          this.onStatusChange('receiving', `Chunk ${partNum} gặp lỗi, thử lại (${attempt}/${CHUNK_MAX_RETRIES}) sau ${Math.round(delay / 1000)}s`);
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
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
