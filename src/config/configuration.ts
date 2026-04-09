export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET!,
  },
  db: {
    url: process.env.DATABASE_URL!,
  },
  storage: {
    s3Bucket: process.env.S3_BUCKET!,
    s3Region: process.env.S3_REGION!,
    s3Endpoint: process.env.S3_ENDPOINT!,
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID!,
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    uploadBaseUrl: process.env.STORAGE_UPLOAD_BASE_URL!,
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL!,
    publicWebBaseUrl: process.env.PUBLIC_WEB_BASE_URL!,
  },
});
