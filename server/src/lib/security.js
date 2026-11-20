import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const hashPassword = pw => bcrypt.hash(pw, 12);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

// A valid bcrypt hash of a random string, used to equalise timing when the email is unknown.
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export class HttpError extends Error {
  constructor(status, message, code, details) { super(message); this.status = status; this.code = code; if (details) this.details = details; }
}
