export interface UserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles?: UserRoleDto[];
}

export interface UserRoleDto {
  roleId: string;
  roleName: string;
  organizationId: string;
  branchId: string | null;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  phone?: string;
  organizationId: string;
  roleId: string;
  branchId?: string;
}

export interface UpdateUserInput {
  name?: string;
  phone?: string;
  avatarUrl?: string;
}

export interface InviteUserInput {
  email: string;
  name: string;
  organizationId: string;
  roleId: string;
  branchId?: string;
}
