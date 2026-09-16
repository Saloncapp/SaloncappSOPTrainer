import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";

export type StaffAuth = {
  staffId: string;
  tenantStoreId: string;
  tenantMongoId: string | null;
  actingUserId?: string;
};

export type AuthedRequest = Request & {
  auth: StaffAuth;
};

type JwtPayload = {
  sub?: string;
  tenantId?: string;
  role?: string;
  actingUserId?: string;
};

const TRAINING_ROLES = new Set(["staff", "genie-staff"]);

export function requireStaffAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  const token =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.nextAuthSecret) as JwtPayload;
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired token." });
    return;
  }

  if (
    !payload.role ||
    !TRAINING_ROLES.has(payload.role) ||
    !payload.sub ||
    !payload.tenantId
  ) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const headerTenantId = req.headers["x-tenant-id"];
  const tenantMongoId =
    typeof headerTenantId === "string" && headerTenantId.trim()
      ? headerTenantId.trim()
      : null;

  const actingUserId =
    typeof payload.actingUserId === "string" && payload.actingUserId.trim()
      ? payload.actingUserId.trim()
      : undefined;

  (req as AuthedRequest).auth = {
    staffId: payload.sub,
    tenantStoreId: payload.tenantId,
    tenantMongoId,
    actingUserId,
  };

  next();
}
