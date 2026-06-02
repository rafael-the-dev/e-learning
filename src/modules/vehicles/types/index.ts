import type { VehicleStatus } from "@/shared/types/common";

export interface VehicleDto {
  id: string;
  organizationId: string;
  branchId: string | null;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  category: string | null;
  transmission: string | null;
  status: VehicleStatus;
  notes: string | null;
  createdAt: Date;
}

export interface CreateVehicleInput {
  organizationId: string;
  branchId?: string;
  plate: string;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  category?: string;
  transmission?: string;
  notes?: string;
}

export interface UpdateVehicleInput {
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  category?: string;
  transmission?: string;
  status?: VehicleStatus;
  notes?: string;
}
