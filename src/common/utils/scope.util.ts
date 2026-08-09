import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../decorators/current-user.decorator';

export function isSuperAdmin(user: AuthUser): boolean {
  return user.role === Role.SUPER_ADMIN;
}

/**
 * Branch id a non-super-admin is bound to. Throws when a staff account was
 * never attached to a branch, since every query below is scoped by it.
 */
export function requireOwnBranch(user: AuthUser): string {
  if (!user.branchId) {
    throw new ForbiddenException(
      'Your account is not attached to a branch yet. Ask a super admin to assign one.',
    );
  }

  return user.branchId;
}

/**
 * Prisma `where` fragment restricting a query to the caller's branch.
 * Super admins see every branch, optionally narrowed by `requestedBranchId`.
 */
export function branchScope(
  user: AuthUser,
  requestedBranchId?: string,
): { branchId?: string } {
  if (isSuperAdmin(user)) {
    return requestedBranchId ? { branchId: requestedBranchId } : {};
  }

  const ownBranchId = requireOwnBranch(user);

  if (requestedBranchId && requestedBranchId !== ownBranchId) {
    throw new ForbiddenException('You can only access your own branch');
  }

  return { branchId: ownBranchId };
}

/**
 * Branch a newly created record belongs to: super admins pick one explicitly,
 * everyone else inherits their own.
 */
export function resolveBranchIdForCreate(
  user: AuthUser,
  requestedBranchId?: string,
): string {
  if (isSuperAdmin(user)) {
    if (!requestedBranchId) {
      throw new BadRequestException('branchId is required for super admins');
    }

    return requestedBranchId;
  }

  const ownBranchId = requireOwnBranch(user);

  if (requestedBranchId && requestedBranchId !== ownBranchId) {
    throw new ForbiddenException(
      'You can only create records inside your own branch',
    );
  }

  return ownBranchId;
}

/** Guards reads/writes of an existing record that already carries a branch. */
export function assertBranchAccess(
  user: AuthUser,
  branchId: string | null,
): void {
  if (isSuperAdmin(user)) {
    return;
  }

  if (!branchId || branchId !== requireOwnBranch(user)) {
    throw new ForbiddenException('This record belongs to another branch');
  }
}
