import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private readonly logger = new Logger(S3Service.name);
  private bucketName: string;
  private publicUrl: string;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get<string>('S3_BUCKET_NAME', 'moban-assets-0424');
    this.publicUrl = this.configService.get<string>('S3_PUBLIC_URL', 'https://objectstorageapi.bja.sealos.run/moban-assets-0424');

    this.s3Client = new S3Client({
      endpoint: process.env.NODE_ENV === 'production' 
        ? 'http://object-storage.objectstorage-system.svc.cluster.local' 
        : this.configService.get<string>('S3_ENDPOINT', 'https://objectstorageapi.bja.sealos.run'),
      region: this.configService.get<string>('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY', 'ujw2lrwn'),
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY', '26mhbpxmjdj8qrnx'),
      },
      forcePathStyle: true,
    });
  }

  async uploadFile(buffer: Buffer, originalname: string, mimetype: string, folder: string = ''): Promise<string> {
    const ext = path.extname(originalname) || '.png';
    const randomSuffix = Math.round(Math.random() * 1e9).toString();
    const filename = `${folder ? folder + '/' : ''}${Date.now()}-${randomSuffix}${ext}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: filename,
        Body: buffer,
        ContentType: mimetype,
      });

      await this.s3Client.send(command);
      const fileUrl = `${this.publicUrl}/${filename}`;
      this.logger.log(`Successfully uploaded file to S3: ${fileUrl}`);
      return fileUrl;
    } catch (error) {
      this.logger.error(`Failed to upload file to S3: ${error.message}`);
      throw error;
    }
  }

  async uploadBase64(base64String: string, folder: string = ''): Promise<string> {
    // Parse base64 string
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 string');
    }
    
    const mimetype = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    
    // Determine extension from mimetype
    let ext = '.png';
    if (mimetype === 'image/jpeg') ext = '.jpg';
    else if (mimetype === 'image/gif') ext = '.gif';
    else if (mimetype === 'image/webp') ext = '.webp';

    const randomSuffix = Math.round(Math.random() * 1e9).toString();
    const filename = `${Date.now()}-${randomSuffix}${ext}`;
    
    return this.uploadFile(buffer, filename, mimetype, folder);
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      if (!fileUrl.startsWith(this.publicUrl)) return;
      
      const key = fileUrl.replace(`${this.publicUrl}/`, '');
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted file from S3: ${fileUrl}`);
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${error.message}`);
    }
  }
}
