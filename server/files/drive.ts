import fs from "fs";
import path from "path";
import { google } from "googleapis";
import type { drive_v3 } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/drive"];
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
const TOKEN_PATH = path.join(process.cwd(), "token.json");

let driveClient: drive_v3.Drive | null = null;

async function getAuthenticatedClient(): Promise<drive_v3.Drive> {
  if (driveClient) return driveClient;

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const { client_id, client_secret, redirect_uris } =
    credentials.installed ?? credentials.web;

  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    auth.setCredentials(token);
  }

  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

export async function uploadFileToDrive(
  filePath: string,
  fileName?: string,
): Promise<drive_v3.Schema$File> {
  const drive = await getAuthenticatedClient();
  const fileMetadata: drive_v3.Schema$File = {
    name: fileName ?? path.basename(filePath),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: {
      mimeType: "application/octet-stream",
      body: fs.createReadStream(filePath),
    },
    fields: "id, name, webViewLink",
  });

  return response.data;
}

export async function listDriveFiles(
  folderId?: string,
): Promise<drive_v3.Schema$File[]> {
  const drive = await getAuthenticatedClient();
  const q = folderId
    ? `'${folderId}' in parents and trashed=false`
    : "trashed=false";

  const response = await drive.files.list({
    q,
    spaces: "drive",
    fields: "files(id, name, mimeType, size, modifiedTime, webViewLink)",
    pageSize: 50,
  });

  return response.data.files ?? [];
}

export async function downloadFromDrive(
  fileId: string,
  destPath: string,
): Promise<string> {
  const drive = await getAuthenticatedClient();
  const dest = fs.createWriteStream(destPath);

  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" },
  );

  return new Promise((resolve, reject) => {
    (response.data as NodeJS.ReadableStream)
      .on("end", () => resolve(destPath))
      .on("error", reject)
      .pipe(dest);
  });
}

export { CREDENTIALS_PATH, TOKEN_PATH };
