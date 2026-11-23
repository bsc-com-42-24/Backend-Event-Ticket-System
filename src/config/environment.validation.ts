import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_PUBLISHED_PORT: Joi.number().port().default(3000),
  DB_PUBLISHED_PORT: Joi.number().port().default(5432),
  DB_HOST: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('localhost'),
  }),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .min(16)
      .invalid('replace-with-a-private-password')
      .required(),
    otherwise: Joi.string()
      .min(1)
      .invalid('replace-with-a-private-password')
      .required()
      .messages({
        'any.invalid': 'replace the DB_PASSWORD example placeholder in .env',
      }),
  }),
  DB_NAME: Joi.string().required(),
  JWT_SECRET: Joi.string()
    .min(32)
    .invalid('replace-this-with-a-random-secret-of-at-least-32-characters')
    .messages({
      'any.invalid':
        'replace the JWT_SECRET example placeholder in .env with a unique random value',
    })
    .required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  CORS_ORIGINS: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().default(
      'http://localhost:5173,http://localhost:3001,http://localhost:4200',
    ),
  }),
  PAYCHANGU_SECRET_KEY: Joi.string().allow('').default(''),
  PAYCHANGU_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  PAYCHANGU_CALLBACK_URL: Joi.string().allow('').default(''),
  PAYCHANGU_RETURN_URL: Joi.string().allow('').default(''),
  PAYCHANGU_API_URL: Joi.string().uri().allow('').default(''),
  PURCHASE_REQUIRES_PAYMENT: Joi.string()
    .valid('true', 'false')
    .allow('')
    .default(''),
});
