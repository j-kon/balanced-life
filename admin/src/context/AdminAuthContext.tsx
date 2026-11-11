import { createContext, useContext } from "react";
import type { AdminPermission, PublicAdmin } from "../types";

export type AdminAuthMeResponse = {
  admin: PublicAdmin | null;
  mfaEnrollmentRequired: boolean;
  mfaChallengeRequired: boolean;
  unusedRecoveryCodesCount: number;
  idleTimeoutMinutes: number;
};

export type AdminContextValue = {
  admin: PublicAdmin | null;
  mfaEnrollmentRequired: boolean;
  mfaChallengeRequired: boolean;
  unusedRecoveryCodesCount: number;
  idleTimeoutMinutes: number;
  refresh: () => Promise<AdminAuthMeResponse | null>;
  logout: () => Promise<void>;
  toast: (message: string) => void;
  hasPermission: (permission: AdminPermission) => boolean;
};

export const AdminAuthContext = createContext<AdminContextValue>(null as never);

export const useAdminAuth = () => useContext(AdminAuthContext);

