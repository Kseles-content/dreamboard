import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  JWT_SECRET: Joi.string().min(8).required(),
  S3_BUCKET: Joi.string().min(1).required(),
  S3_REGION: Joi.string().min(1).required(),
  S3_ENDPOINT: Joi.string().uri().required(),
  S3_ACCESS_KEY_ID: Joi.string().min(1).required(),
  S3_SECRET_ACCESS_KEY: Joi.string().min(1).required(),
  STORAGE_UPLOAD_BASE_URL: Joi.string().uri().required(),
  STORAGE_PUBLIC_BASE_URL: Joi.string().uri().required(),
  PUBLIC_WEB_BASE_URL: Joi.string().uri().required(),
});
