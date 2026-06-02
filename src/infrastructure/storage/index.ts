// =============================================================================
// STORAGE ABSTRACTION
// Never import a provider directly — always use this interface.
// Swap the implementation in storage.provider.ts without touching callers.
// Supported future providers: Local, AWS S3, Cloudflare R2
// =============================================================================

export interface StorageProvider {
  upload(
    key: string,
    buffer: Buffer,
    options?: UploadOptions
  ): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export interface UploadOptions {
  contentType?: string;
  isPublic?: boolean;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
}

// =============================================================================
// LOCAL STORAGE (development / on-premise)
// =============================================================================

import fs from "fs/promises";
import path from "path";

class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;
  private readonly baseUrl: string;

  constructor(baseDir = "./uploads", baseUrl = "/uploads") {
    this.baseDir = baseDir;
    this.baseUrl = baseUrl;
  }

  async upload(key: string, buffer: Buffer, options?: UploadOptions): Promise<UploadResult> {
    const filePath = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return { key, url: this.getUrl(key), size: buffer.length };
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    await fs.unlink(filePath).catch(() => {});
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  async getSignedUrl(key: string): Promise<string> {
    return this.getUrl(key);
  }
}

// =============================================================================
// PROVIDER FACTORY — swap via env var STORAGE_PROVIDER
// =============================================================================

function createStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? "local";

  switch (provider) {
    case "local":
      return new LocalStorageProvider(
        process.env.STORAGE_LOCAL_DIR ?? "./uploads",
        process.env.STORAGE_LOCAL_URL ?? "/uploads"
      );
    // case "s3":
    //   return new S3StorageProvider(...)
    // case "r2":
    //   return new R2StorageProvider(...)
    default:
      return new LocalStorageProvider();
  }
}

export const storage = createStorageProvider();
