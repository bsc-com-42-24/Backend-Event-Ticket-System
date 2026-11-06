import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DB_HOST: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('localhost'),
  }),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('postgres'),
  }),
  DB_PASSWORD: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(16).required(),
    otherwise: Joi.string().allow('').default('postgres'),
  }),
  DB_NAME: Joi.string().default('ticket_master'),
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
});