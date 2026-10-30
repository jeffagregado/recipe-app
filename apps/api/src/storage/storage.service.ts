import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import type { Environment } from '../config/environment.js';

const downloadExpirySchema = z.number().int().min(1).max(604_800);
/** How long a pooled connection may sit unused before the client closes it. The storage server closes one 60 s after its last
 * request, and a call written to it at that moment is reset; with one attempt per call, that call fails.
 */
const STORAGE_IDLE_CONNECTION_MS = 30_000;

export class StorageError extends Error {
  override readonly name = 'StorageError';
}

function validateKey(key: string): void {
  if (!key.trim()) throw new RangeError('Storage key must not be empty.');
}

@Injectable()
export class StorageService implements OnApplicationShutdown {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Environment, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('AWS_ENDPOINT_URL_S3', { infer: true }),
      region: config.get('AWS_REGION', { infer: true }),
      credentials: {
        accessKeyId: config.get('AWS_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('AWS_SECRET_ACCESS_KEY', { infer: true }),
      },
      forcePathStyle: true,
      maxAttempts: 1,
      requestHandler: { httpAgent: { timeout: STORAGE_IDLE_CONNECTION_MS }, httpsAgent: { timeout: STORAGE_IDLE_CONNECTION_MS } },
    });
  }

  async upload(key: string, body: Uint8Array, contentType: string): Promise<string> {
    validateKey(key);
    if (!contentType.trim()) throw new RangeError('Storage contentType must not be empty.');
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket, Key: key, Body: body, ContentType: contentType,
      }), { abortSignal: AbortSignal.timeout(10_000) });
      return key;
    } catch (cause) {
      throw new StorageError('Storage upload failed. Check storage configuration, bucket access, and network availability.', { cause });
    }
  }

  async deleteObject(key: string): Promise<void> {
    validateKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(10_000),
      });
    } catch (cause) {
      throw new StorageError('Storage delete failed. Check storage configuration, bucket access, and network availability.', { cause });
    }
  }

  /** The objects under `prefix`, one page of up to 1000 at a time. */
  async *listObjects(prefix: string): AsyncGenerator<{ key: string; lastModified: Date }[]> {
    validateKey(prefix);
    let token: string | undefined;
    do {
      let page;
      try {
        page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }), { abortSignal: AbortSignal.timeout(10_000) });
      } catch (cause) {
        throw new StorageError('Storage listing failed. Check storage configuration, bucket access, and network availability.', { cause });
      }
      yield (page.Contents ?? []).flatMap(({ Key, LastModified }) => (Key && LastModified ? [{ key: Key, lastModified: LastModified }] : []));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }

  async signedDownloadUrl(key: string, expiresIn = 900): Promise<string> {
    validateKey(key);
    if (!downloadExpirySchema.safeParse(expiresIn).success) {
      throw new RangeError('Storage expiresIn must be an integer between 1 and 604800 seconds.');
    }
    try {
      return await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
    } catch (cause) {
      throw new StorageError('Storage download URL signing failed. Check storage credentials and configuration.', { cause });
    }
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}
