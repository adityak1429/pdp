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
const PORT = 3000;

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
  console.log(`Saving files for session ${req.files}`);
  for (const file of req.files) {
    const filePath = path.join(sessionDir, file.originalname);
    console.log(`Saving file: ${filePath}`);
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
    pollUrl: `/poll/${sessionId}`,
    previewUrl: `/preview?session=${sessionId}`
  });
});

global.sessionFlags = {};
// Add this endpoint for polling files
app.get('/poll/:sessionId', (req, res) => {
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
});

app.post('/:sessionId/complete', upload.any(), (req, res) => {
  const sessionId = req.params.sessionId;
  const sessionDir = path.join(__dirname, 'sessions', sessionId);
  
  console.log(`Completing session: ${sessionId}`);
  
  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: "Session not found." });
  }

  // // Delete all existing files in the session directory
  // for (const file of fs.readdirSync(sessionDir)) {
  //   fs.unlinkSync(path.join(sessionDir, file));
  // }

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
app.get('/media/:sessionId/:originalname', (req, res) => {
  const { sessionId, originalname } = req.params;
  const filePath = path.join(__dirname, 'sessions', sessionId, originalname);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  // Send file as a form with 'files' field, including file name and buffer
  res.setHeader('Content-Type', 'application/json');
  const fileBuffer = fs.readFileSync(filePath);
  res.json({
    files: [
      {
        filename: originalname,
        buffer: fileBuffer.toString('base64')
      }
    ]
  });
});

// Add this endpoint to get session metadata and media file list
app.get('/session/:sessionId', (req, res) => {
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
  // List all media files except metadata.json
  const mediaFiles = fs.readdirSync(sessionDir).filter(f => f !== 'metadata.json');
  res.json({
    metadata,
    mediaFiles,
    mediaBase: `/media/${sessionId}/`
  });
});

// Clear all files and metadata for a session
app.post('/session/:sessionId/clear', (req, res) => {
  const sessionId = req.params.sessionId;
  const sessionDir = path.join(__dirname, 'sessions', sessionId);

  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: "Session not found." });
  }

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

  res.json({ status: "Session cleared", sessionId });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));