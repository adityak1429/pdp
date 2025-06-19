import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT =  process.env.PORT || 3000;;

app.use(cors());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());


const storage = multer.memoryStorage();
const upload = multer({ storage });

app.get('/preview', (req, res) => {
  res.sendFile(path.resolve('public/editor.html'));
});

// Function to save files and metadata
const saveFiles = (req, sessionId) => {
  const sessionDir = path.join(__dirname, 'sessions', sessionId);

  // Parse metadata
  let metadata = {};
  const metadataField = req.body.metadata;
  if (metadataField) {
    try {
      metadata = JSON.parse(metadataField);
      console.log(`Metadata received: ${JSON.stringify(metadata,null,2)}`);
    } catch (e) {
      throw new Error("Invalid metadata JSON.");
    }
  }

  // Save metadata.json
  fs.writeFileSync(path.join(sessionDir, 'metadata.json'), JSON.stringify(metadata));
  console.log(`Metadata saved for session ${sessionDir}`);
  // Save files
  const mediaFiles = [];
  for (const file of req.files) {
    const filePath = path.join(sessionDir, file.originalname);
    fs.writeFileSync(filePath, file.buffer);
    if (file.originalname !== 'metadata.json') {
      console.log(`File saved: ${filePath}`);
      mediaFiles.push(file.originalname);
    }
  }
};

// Add this endpoint for remote upload
app.post('/upload', upload.any(), (req, res) => {
  // Create a new session
  const sessionId = uuidv4();
  const sessionDir = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  // Save metadata and files
  try {
    saveFiles(req, sessionId);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  // Respond with poll and preview URLs
  res.json({
    pollUrl: `/${sessionId}/poll`,
    previewUrl: `/preview?session=${sessionId}`
  });
});

global.sessionFlags = {};
// Add this endpoint for polling files
app.get('/:sessionId/poll', (req, res) => {
  if (!global.sessionFlags[req.params.sessionId]) {
    global.sessionFlags[req.params.sessionId] = { completed: false };
    return res.status(288).json({ status: "Session not approved-1" });
  } 
  if (!global.sessionFlags[req.params.sessionId].completed) {
    return res.status(289).json({ status: "Session not approved" });
  }
  const sessionId = req.params.sessionId;
  const sessionDir = path.join(__dirname, 'sessions', sessionId);
  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: "Session not found." });
  }
  const files = fs.readdirSync(sessionDir);
  const result = files.map(originalname => {
    const filePath = path.join(sessionDir, originalname);
    const data = fs.readFileSync(filePath);
    return {
      filename: originalname,
      data: data.toString('base64')
    };
  });
  res.json(result);
  // Delete all files in the session directory
  for (const file of fs.readdirSync(sessionDir)) {
    fs.unlinkSync(path.join(sessionDir, file));
  }
  // Optionally, remove the session directory itself
  fs.rmdirSync(sessionDir);

  // Remove session flag if present
  if (global.sessionFlags && global.sessionFlags[sessionId]) {
    delete global.sessionFlags[sessionId];
  }

});

app.post('/:sessionId/complete', upload.any(), (req, res) => {
  const sessionId = req.params.sessionId;
  const sessionDir = path.join(__dirname, 'sessions', sessionId);
  
  console.log(`Completing session: ${sessionId}`);
  
  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: "Session not found." });
  }

  // // Delete all existing files in the session directory
  for (const file of fs.readdirSync(sessionDir)) {
    fs.unlinkSync(path.join(sessionDir, file));
  }

  // Save new files
  try {
    saveFiles(req, sessionId);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  global.sessionFlags[sessionId] = { completed: true };

  console.log(`Session ${sessionId} completed and updated.`);
  res.json({ status: "Session updated", sessionId });
});

// Serve session media files at /media/:sessionId/:originalname
app.get('/:sessionId/media/', (req, res) => {
  const { sessionId } = req.params;
  const sessionDir = path.join(__dirname, 'sessions', sessionId);
  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: "Session not found." });
  }
  const files = fs.readdirSync(sessionDir).filter(f => f !== 'metadata.json');
  const result = files.map(filename => {
    const filePath = path.join(sessionDir, filename);
    const data = fs.readFileSync(filePath);
    return {
      name: filename,
      data: data.toString('base64')
      
    };
  });
  res.json(result);


});

// Add this endpoint to get session metadata and media file list
app.get('/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const sessionDir = path.join(__dirname, 'sessions', sessionId);
  const metadataPath = path.join(sessionDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error(`Metadata not found at ${metadataPath}`);
    const files = fs.existsSync(sessionDir) ? fs.readdirSync(sessionDir) : [];
    console.log(`Files at ${sessionDir}:`, files);
    return res.status(404).json({ error: `metadata not found at ${metadataPath}.` });
  }
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  res.json({
    metadata
   });
});

app.get('/', (req, res) => {
  res.send(`
    <h1>Media Upload Server</h1>
    <p>Use the following endpoints:</p>
    <ul>
      <li><strong>v:</strong> 3</li>
      <li><strong>Upload:</strong> POST /upload</li>
      <li><strong>Poll:</strong> GET /:sessionId/poll</li>
      <li><strong>Complete:</strong> POST /:sessionId/complete</li>
      <li><strong>Get Metadata:</strong> GET /:sessionId</li>
      <li><strong>Get Media Files:</strong> GET /:sessionId/media/</li>
    </ul>
  `);
});

import cron from 'node-cron';

// Cleanup job: runs every day at 2:30 AM
cron.schedule('30 2 * * *', () => {
  const SESSIONS_DIR = path.join(__dirname, 'sessions');
  const MAX_AGE_MS = 1 * 24 * 60 * 60 * 1000; // 1 days

  if (!fs.existsSync(SESSIONS_DIR)) return;
  fs.readdirSync(SESSIONS_DIR).forEach(folder => {
    const folderPath = path.join(SESSIONS_DIR, folder);
    try {
      const stats = fs.statSync(folderPath);
      if (Date.now() - stats.mtimeMs > MAX_AGE_MS) {
        fs.rmSync(folderPath, { recursive: true, force: true });
        console.log(`[CLEANUP] Deleted old session: ${folderPath}`);
      }
    } catch (e) {
      console.error(`[CLEANUP] Error checking/deleting ${folderPath}:`, e.message);
    }
  });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));