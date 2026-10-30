import { getDatabaseClient } from "@bods-integrated-data/shared/database";
import { logger } from "@bods-integrated-data/shared/logger";
import { describe, expect, it, vi } from "vitest";
import { TableKey, checkTables, renameTables } from ".";

const mockExecute = vi.fn().mockResolvedValue([{ count: 100 }]);
const mockSchema = {
    dropTable: vi.fn().mockReturnThis(),
    ifExists: vi.fn().mockReturnThis(),
    cascade: vi.fn().mockReturnThis(),
    alterTable: vi.fn().mockReturnThis(),
    renameTo: vi.fn().mockReturnThis(),
    execute: mockExecute,
};

describe("table renamer", () => {
    vi.mock("@bods-integrated-data/shared/database", () => ({
        getDatabaseClient: vi.fn(() => ({
            selectFrom: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            execute: mockExecute,
            schema: mockSchema,
            destroy: vi.fn(),
            fn: {
                count: vi.fn().mockReturnThis(),
                as: vi.fn(),
            },
        })),
    }));

    vi.mock("@bods-integrated-data/shared/logger", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@bods-integrated-data/shared/logger")>()),
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    }));

    const tables: TableKey[] = [{ table: "trip", newTable: "trip_new", key: "id", requiredPercentage: 60 }];

    describe("getMatchingTables", () => {
        it("should not throw an error with valid percentages", async () => {
            const dbClient = await getDatabaseClient(true);

            await expect(checkTables(dbClient, tables)).resolves.not.toThrowError();
        });

        it("should throw an error if match percentage is less than 80%", async () => {
            const dbClient = await getDatabaseClient(true);
            mockExecute.mockResolvedValueOnce([{ count: 50 }]);

            await expect(checkTables(dbClient, tables)).rejects.toThrowError(
                "Tables trip and trip_new have less than an 60% match, percentage match: 50%",
            );
        });

        it("should only log a warning if match percentage is less than required and mode is warn", async () => {
            const dbClient = await getDatabaseClient(true);
            mockExecute.mockResolvedValueOnce([{ count: 50 }]);
            vi.stubEnv("REQUIRED_PERCENTAGE_MODE", "warn");

            await expect(checkTables(dbClient, tables)).resolves.not.toThrowError();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("have less than an 60% match"));

            vi.unstubAllEnvs();
        });

        it("should throw an error if new table is empty", async () => {
            const dbClient = await getDatabaseClient(true);
            mockExecute.mockResolvedValueOnce([{ count: 0 }]);

            await expect(checkTables(dbClient, tables)).rejects.toThrowError("No data found in table trip_new");
        });

        it("should skip percentage check if current table is empty", async () => {
            const dbClient = await getDatabaseClient(true);
            mockExecute.mockResolvedValueOnce([{ count: 100 }]);
            mockExecute.mockResolvedValueOnce([{ count: 0 }]);

            await expect(checkTables(dbClient, tables)).resolves.not.toThrowError();
        });
    });

    describe("renameTables", () => {
        it("should drop the old table", async () => {
            const dbClient = await getDatabaseClient(true);
            await renameTables(dbClient, tables);

            expect(mockSchema.dropTable).toHaveBeenCalledWith("trip_old");
        });

        it("should rename the current table", async () => {
            const dbClient = await getDatabaseClient(true);
            await renameTables(dbClient, tables);

            expect(mockSchema.alterTable).toHaveBeenCalledWith("trip");
            expect(mockSchema.renameTo).toHaveBeenCalledWith("trip_old");
        });

        it("should rename the new table", async () => {
            const dbClient = await getDatabaseClient(true);
            await renameTables(dbClient, tables);

            expect(mockSchema.alterTable).toHaveBeenCalledWith("trip_new");
            expect(mockSchema.renameTo).toHaveBeenCalledWith("trip");
        });
    });
});
