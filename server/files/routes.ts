import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import * as drive from "./drive";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const ENABLE_DRIVE = fs.existsSync(drive.CREDENTIALS_PATH);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), driveEnabled: ENABLE_DRIVE });
});

// List files in the uploads directory (or a subdirectory of it)
router.get("/files/:dir?", (req, res) => {
  try {
    const subdir = req.params.dir ?? "";
    const fullPath = path.join(UPLOADS_DIR, subdir);

    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: "Directory not found" });
      return;
    }

    const files = fs.readdirSync(fullPath).map((file) => {
      const filePath = path.join(fullPath, file);
      const stat = fs.statSync(filePath);
      return { name: file, isDirectory: stat.isDirectory(), size: stat.size, modified: stat.mtime };
    });

    res.json({ path: subdir || "/", files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Upload a file, with optional Google Drive sync
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const response: Record<string, unknown> = {
    message: "File uploaded successfully",
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`,
    driveId: null,
  };

  if (ENABLE_DRIVE && req.body.syncToDrive === "true") {
    try {
      const driveFile = await drive.uploadFileToDrive(req.file.path, req.file.originalname);
      response.driveId = driveFile.id;
      response.driveLink = driveFile.webViewLink;
    } catch (err: any) {
      response.driveSyncError = err.message;
    }
  }

  res.json(response);
});

// List Google Drive files
router.get("/drive/files", async (_req, res) => {
  if (!ENABLE_DRIVE) {
    res.status(400).json({ error: "Google Drive not enabled" });
    return;
  }

  try {
    const files = await drive.listDriveFiles();
    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Download a file from Google Drive to local uploads
router.post("/drive/download/:fileId", async (req, res) => {
  if (!ENABLE_DRIVE) {
    res.status(400).json({ error: "Google Drive not enabled" });
    return;
  }

  try {
    const fileName = (req.body.fileName as string) || "download";
    const destPath = path.join(UPLOADS_DIR, fileName);
    await drive.downloadFromDrive(req.params.fileId, destPath);
    res.json({ message: "Downloaded from Drive", localPath: `/uploads/${path.basename(destPath)}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a local file
router.delete("/files/:filename", (req, res) => {
  try {
    const filePath = path.join(UPLOADS_DIR, req.params.filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    fs.unlinkSync(filePath);
    res.json({ message: "File deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
