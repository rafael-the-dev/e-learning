// =============================================================================
// USERS MODULE TYPES
// =============================================================================

export interface OrgUserRole {
  id: string;
  name: string;
}

/** Flat DTO combining User + their membership in a specific organization. */
export interface OrgUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  joinedAt: Date;
  isOwner: boolean;
  roles: OrgUserRole[];
}

/** A role available for assignment within an organization. */
export interface AssignableRole {
  id: string;
  name: string;
  isSystem: boolean;
}

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ORG_ADMIN: "Administrador",
  SECRETARY: "Secretária",
  TEACHER: "Formador",
  STUDENT: "Aluno",
};
