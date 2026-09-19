import { describe, expect, it } from "vitest";
import { isSupportedMediaType, usernameSchema } from "./routers";

describe("ICEGRAM validation", () => {
  it("accepts the username format used by public identity search", () => {
    expect(usernameSchema.safeParse("fawas_2026").success).toBe(true);
    expect(usernameSchema.safeParse("ab").success).toBe(false);
    expect(usernameSchema.safeParse("hello world").success).toBe(false);
    expect(usernameSchema.safeParse("icegram-user").success).toBe(false);
  });

  it("only allows explicitly supported media types", () => {
    expect(isSupportedMediaType("image/jpeg")).toBe(true);
    expect(isSupportedMediaType("audio/webm")).toBe(true);
    expect(isSupportedMediaType("application/pdf")).toBe(true);
    expect(isSupportedMediaType("application/x-executable")).toBe(false);
    expect(isSupportedMediaType("text/html")).toBe(false);
  });
});
