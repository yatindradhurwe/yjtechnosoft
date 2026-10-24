import type { Membership, Tenant, User } from '@prisma/client';
import type { Permission } from './lib/permissions';

declare global {
  namespace Express {
    interface Request {
      user?: Pick<User, 'id' | 'email' | 'name' | 'platformRole' | 'status' | 'emailVerifiedAt'>;
      tenant?: Tenant;
      membership?: Membership | null;
      permissions?: Set<Permission>;
      /** Raw request body (kept for webhook signature verification) */
      rawBody?: Buffer;
    }
  }
}

export {};
