import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 via S3-compatible API. Inactive until R2_* env is set —
// metadata endpoints work regardless; upload/download URLs return 503 meanwhile.
function guessType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'txt': return 'text/plain';
    case 'csv': return 'text/csv';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls': return 'application/vnd.ms-excel';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}

@Injectable()
export class R2Service {
  private client: S3Client | null = null;
  private bucket: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('R2_ENDPOINT');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucket = this.config.get<string>('R2_BUCKET') ?? 'remy-docs';
    if (endpoint && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  get configured() {
    return this.client !== null;
  }

  private needClient() {
    if (!this.client) {
      throw new ServiceUnavailableException({
        message: 'R2 storage not configured — set R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY',
        configured: false,
      });
    }
    return this.client;
  }

  uploadUrl(key: string, contentType: string) {
    const client = this.needClient();
    return getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: 900 },
    );
  }

  downloadUrl(key: string) {
    const client = this.needClient();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 900,
    });
  }

  /** Fetch an object's bytes (for email attachments). Throws 503 when unconfigured. */
  async getObject(key: string): Promise<{ bytes: Buffer; contentType: string }> {
    const client = this.needClient();
    const out = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    const stream = out.Body as unknown as AsyncIterable<Uint8Array> | undefined;
    if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
      throw new Error(`Unreadable object body for key ${key}`);
    }
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return { bytes: Buffer.concat(chunks), contentType: (out.ContentType as string | undefined) ?? guessType(key) };
  }
}
