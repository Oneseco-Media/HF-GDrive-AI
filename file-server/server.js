const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const drive = require('./drive');
const { uploadFileToR2, ENABLE_R2 } = require('./r2');
const { sendNotification, ENABLE_PUSHCUT } = require('./pushcut');

const app = express();
const PORT = process.env.PORT || 3000;
const ENABLE_DRIVE = fs.existsSync(path.join(__dirname, 'credentials.json'));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    driveEnabled: ENABLE_DRIVE,
    r2Enabled: ENABLE_R2,
    pushcutEnabled: ENABLE_PUSHCUT
  });
});

// List files in directory
app.get('/api/files/:dir?', (req, res) => {
  try {
    const dir = req.params.dir || '';
    const fullPath = path.join(__dirname, 'public', dir);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }
    
    const files = fs.readdirSync(fullPath).map(file => {
      const filePath = path.join(fullPath, file);
      const stat = fs.statSync(filePath);
      return {
        name: file,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        modified: stat.mtime
      };
    });
    
    res.json({ path: dir || '/', files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload file (with optional Drive sync)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const response = {
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`,
    driveId: null,
    r2Url: null
  };

  // Sync to Google Drive if enabled
  if (ENABLE_DRIVE && req.body.syncToDrive === 'true') {
    try {
      const driveFile = await drive.uploadFileToDrive(req.file.path, req.file.originalname);
      response.driveId = driveFile.id;
      response.driveLink = driveFile.webViewLink;
    } catch (error) {
      console.error('Drive sync failed:', error);
      response.driveSyncError = error.message;
    }
  }

  // Sync to Cloudflare R2 if enabled
  if (ENABLE_R2 && req.body.syncToR2 === 'true') {
    try {
      const r2File = await uploadFileToR2(req.file.path, req.file.originalname);
      response.r2Url = r2File.url;
      response.r2Key = r2File.key;
    } catch (error) {
      console.error('R2 sync failed:', error);
      response.r2SyncError = error.message;
    }
  }

  // Send Pushcut notification if enabled
  if (ENABLE_PUSHCUT && req.body.notifyPushcut === 'true') {
    try {
      await sendNotification(
        'New File Uploaded',
        `File: ${req.file.originalname}\nSize: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`
      );
      response.pushcutNotified = true;
    } catch (error) {
      console.error('Pushcut notification failed:', error);
      response.pushcutError = error.message;
    }
  }

  res.json(response);
});

// List Google Drive files
app.get('/api/drive/files', async (req, res) => {
  if (!ENABLE_DRIVE) {
    return res.status(400).json({ error: 'Google Drive not enabled' });
  }

  try {
    const files = await drive.listDriveFiles();
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download from Google Drive
app.post('/api/drive/download/:fileId', async (req, res) => {
  if (!ENABLE_DRIVE) {
    return res.status(400).json({ error: 'Google Drive not enabled' });
  }

  try {
    const fileName = req.body.fileName || 'download';
    const destPath = path.join(__dirname, 'public', 'uploads', fileName);
    
    await drive.downloadFromDrive(req.params.fileId, destPath);
    
    res.json({ 
      message: 'Downloaded from Drive',
      localPath: `/uploads/${path.basename(destPath)}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete file
app.delete('/api/files/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    fs.unlinkSync(filePath);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`📁 File server running at http://0.0.0.0:${PORT}`);
  if (ENABLE_DRIVE) {
    console.log('☁️  Google Drive sync enabled');
  }
  if (ENABLE_R2) {
    console.log('☁️  Cloudflare R2 sync enabled');
  }
  if (ENABLE_PUSHCUT) {
    console.log('🔔 Pushcut notifications enabled');
  }
});
