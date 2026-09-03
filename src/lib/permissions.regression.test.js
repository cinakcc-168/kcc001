import { describe, expect, it } from "vitest";
import {
  accessAllows,
  fallbackAccessForRole,
  loadMyAccess,
  ROLE_PERMISSION_FALLBACKS
} from "./permissions.js";

describe("permission regression guards", () => {
  it("does not grant cash register override through normal manager fallback", () => {
    expect(ROLE_PERMISSION_FALLBACKS.manager).not.toContain("cash_register.override");
    const access = fallbackAccessForRole("manager");
    expect(accessAllows(access, "cash_register.override")).toBe(false);
  });

  it("allows an explicitly granted cash register override permission", () => {
    const access = {
      role: "manager",
      permissions: { "cash_register.override": true }
    };
    expect(accessAllows(access, "cash_register.override")).toBe(true);
  });

  it("keeps unrelated permissions out of a manager fallback", () => {
    const access = fallbackAccessForRole("manager");
    expect(accessAllows(access, "system.super_admin")).toBe(false);
    // accounting.manage is a critical, owner/admin-only permission (chart of
    // accounts, manual journals, period locks — see 34_accounting_export_general_ledger.sql).
    // Managers keep accounting.export, which they are meant to have.
    expect(accessAllows(access, "accounting.manage")).toBe(false);
    expect(accessAllows(access, "accounting.export")).toBe(true);
  });
});


describe("authorization failure guards", () => {
  it("fails closed when get_my_access returns an unexpected error", async () => {
    const supabase = {
      rpc: async () => ({
        data: null,
        error: { code: "500", status: 500, message: "Temporary authorization failure" }
      })
    };

    const access = await loadMyAccess(supabase, "manager");

    expect(access.authorizationUnavailable).toBe(true);
    expect(access.permissions).toEqual({});
    expect(accessAllows(access, "sales.create")).toBe(false);
    expect(accessAllows(access, "cash_register.override")).toBe(false);
    expect(access.limits.max_discount_percent).toBe(0);
  });

  it("keeps the legacy role fallback only when get_my_access is genuinely unavailable", async () => {
    const supabase = {
      rpc: async () => ({
        data: null,
        error: { code: "PGRST202", status: 404, message: "Could not find the function public.get_my_access" }
      })
    };

    const access = await loadMyAccess(supabase, "manager");

    expect(access.fallback).toBe(true);
    expect(access.authorizationUnavailable).toBeUndefined();
    expect(accessAllows(access, "sales.create")).toBe(true);
  });

  it("does not let an owner bypass an authorization-service failure", () => {
    const access = {
      role: "owner",
      permissions: {},
      authorizationUnavailable: true
    };

    expect(accessAllows(access, "sales.create")).toBe(false);
    expect(accessAllows(access, "settings.manage")).toBe(false);
  });
});
