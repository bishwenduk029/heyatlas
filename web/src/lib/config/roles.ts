import { userRoleEnum } from "@/database/schema";

// Export role types from database schema to ensure single source of truth
export type UserRole = (typeof userRoleEnum.enumValues)[number];

// Role hierarchy configuration - higher numbers mean higher permissions
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 1,
  admin: 2,
  super_admin: 3,
} as const;

/**
 * Check if user has required role permissions
 * @param userRole User's current role
 * @param requiredRole Required minimum role
 * @returns Whether has permission
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Get all available roles
 */
export function getAllRoles(): UserRole[] {
  return userRoleEnum.enumValues as UserRole[];
}

/**
 * Get role's hierarchy level
 */
export function getRoleLevel(role: UserRole): number {
  return ROLE_HIERARCHY[role];
}

/**
 * Check if role is admin level (admin or higher)
 */
export function isAdminRole(role: UserRole): boolean {
  return hasRole(role, "admin");
}

/**
 * Check if role is super admin
 */
export function isSuperAdminRole(role: UserRole): boolean {
  return role === "super_admin";
}
