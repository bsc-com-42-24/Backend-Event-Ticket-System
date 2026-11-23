import * as bcrypt from 'bcryptjs';
import dataSource from '../database/data-source';
import { UserRole } from '../users/user-role.enum';

const BCRYPT_SALT_ROUNDS = 12;
const BCRYPT_MAX_PASSWORD_BYTES = 72;

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

async function bootstrapAdmin(): Promise<void> {
  try {
    const name = requiredEnvironmentVariable('BOOTSTRAP_ADMIN_NAME');
    const email = requiredEnvironmentVariable(
      'BOOTSTRAP_ADMIN_EMAIL',
    ).toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!password || !password.trim()) {
      throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be set');
    }

    if (name.length < 2 || name.length > 150) {
      throw new Error(
        'BOOTSTRAP_ADMIN_NAME must be between 2 and 150 characters',
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
    }
    if (
      password.length < 12 ||
      Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES
    ) {
      throw new Error(
        'BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters and no more than 72 UTF-8 bytes',
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    await dataSource.initialize();
    const userId = await dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(73005123)');

      const activeAdmins: { user_id: string }[] = await manager.query(
        `SELECT user_id FROM users
         WHERE role = $1 AND is_active = TRUE
         LIMIT 1`,
        [UserRole.ADMIN],
      );
      if (activeAdmins.length > 0) {
        throw new Error(
          'An active administrator already exists; bootstrap was refused',
        );
      }

      const existingUsers: { user_id: string }[] = await manager.query(
        `SELECT user_id FROM users
         WHERE LOWER(email) = $1
         ORDER BY user_id
         FOR UPDATE`,
        [email],
      );
      if (existingUsers.length > 1) {
        throw new Error(
          'Multiple accounts use this email address with different casing; resolve them before bootstrap',
        );
      }
      const rows: { user_id: string }[] = existingUsers.length
        ? await manager.query(
            `UPDATE users
             SET full_name = $1, email = $2, password_hash = $3, role = $4,
                 is_active = TRUE, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $5
             RETURNING user_id`,
            [name, email, passwordHash, UserRole.ADMIN, existingUsers[0].user_id],
          )
        : await manager.query(
            `INSERT INTO users (full_name, email, password_hash, role, is_active)
             VALUES ($1, $2, $3, $4, TRUE)
             RETURNING user_id`,
            [name, email, passwordHash, UserRole.ADMIN],
          );
      return String(rows[0].user_id);
    });

    console.log(`Administrator account is ready (user ID ${userId}, ${email}).`);
  } catch (error) {
    console.error(
      `Administrator bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

void bootstrapAdmin();
