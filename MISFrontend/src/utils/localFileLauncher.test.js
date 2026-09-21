import { describe, expect, test } from "vitest";
import {
  buildMisFileUrl,
  getBillLocalPaths,
  joinWindowsPath,
  normalizeWindowsPath,
} from "./localFileLauncher";

describe("localFileLauncher", () => {
  test("keeps UNC roots usable from LAN computers", () => {
    expect(normalizeWindowsPath("\\\\OFFICE-SERVER\\Orders\\")).toBe(
      "\\\\OFFICE-SERVER\\Orders"
    );
    expect(joinWindowsPath("\\\\OFFICE-SERVER\\Orders", "123 - Client.cdr")).toBe(
      "\\\\OFFICE-SERVER\\Orders\\123 - Client.cdr"
    );
  });

  test("accepts a file URL pasted into settings", () => {
    expect(normalizeWindowsPath("file://OFFICE-SERVER/Orders/Designs")).toBe(
      "\\\\OFFICE-SERVER\\Orders\\Designs"
    );
  });

  test("resolves a bill to the locally synced file name", () => {
    expect(
      getBillLocalPaths(
        { driveFile: { name: "901 - Example Customer.cdr" } },
        "\\\\OFFICE-SERVER\\GoogleDrive\\Orders"
      )
    ).toEqual({
      folderPath: "\\\\OFFICE-SERVER\\GoogleDrive\\Orders",
      filePath: "\\\\OFFICE-SERVER\\GoogleDrive\\Orders\\901 - Example Customer.cdr",
    });
  });

  test("encodes a custom protocol URL without losing the UNC path", () => {
    const url = buildMisFileUrl("\\\\OFFICE-SERVER\\Orders\\901 - Client.cdr", {
      select: true,
    });
    expect(url).toContain("misfile://open?path=");
    expect(url).toContain("select=1");
    expect(decodeURIComponent(url)).toContain("\\\\OFFICE-SERVER\\Orders\\901 - Client.cdr");
  });
});
