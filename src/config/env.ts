import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().default('https://suscribe.appzplay.online'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres').default('appzplay_super_secret_jwt_key_at_least_32_chars_long_2026!'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET debe tener al menos 16 caracteres').default('appzplay_cookie_signing_secret_64_characters_long_super_secure_key!'),
  CORS_ORIGIN: z.string().default('*'),
  CACHE_TTL_MS: z.coerce.number().default(30000),
  AUDIT_LOG_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true),
  SUSPENDED_REDIRECT_URL: z.string().default('/suspended'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error de validación de variables de entorno:', parsed.error.format());
  throw new Error('Configuración de entorno inválida');
}

export const env = parsed.data;
