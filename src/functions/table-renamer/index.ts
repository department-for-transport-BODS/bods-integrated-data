import { Database, KyselyDb, getDatabaseClient } from "@bods-integrated-data/shared/database";
import { errorMapWithDataLogging, logger, withLambdaRequestTracker } from "@bods-integrated-data/shared/logger";
import { Handler } from "aws-lambda";
import { ReferenceExpression } from "kysely";
import { z } from "zod";

z.setErrorMap(errorMapWithDataLogging);

let dbClient: KyselyDb;

export interface TableKey {
    table: keyof Database;
    newTable: keyof Database;
    key: ReferenceExpression<Database, keyof Database>;
    requiredPercentage?: number;
}

const requiredPercentage = (table: string) => Number(process.env[`${table.toUpperCase()}_REQUIRED_PERCENTAGE`] || 70);

// Rename BODS related tables
const databaseTables: TableKey[] = [
    { table: "calendar", newTable: "calendar_new", key: "id", requiredPercentage: requiredPercentage("calendar") },
    {
        table: "calendar_date",
        newTable: "calendar_date_new",
        key: "id",
        requiredPercentage: requiredPercentage("calendar_date"),
    },
    { table: "stop", newTable: "stop_new", key: "id", requiredPercentage: requiredPercentage("stop") },
    { table: "shape", newTable: "shape_new", key: "id", requiredPercentage: requiredPercentage("shape") },
    { table: "trip", newTable: "trip_new", key: "id", requiredPercentage: requiredPercentage("trip") },
    { table: "frequency", newTable: "frequency_new", key: "id", requiredPercentage: requiredPercentage("frequency") },
    { table: "stop_time", newTable: "stop_time_new", key: "id", requiredPercentage: requiredPercentage("stop_time") },
    { table: "noc_operator", newTable: "noc_operator_new", key: "noc" },
    { table: "naptan_stop", newTable: "naptan_stop_new", key: "atco_code" },
    { table: "naptan_stop_area", newTable: "naptan_stop_area_new", key: "stop_area_code" },
    { table: "nptg_admin_area", newTable: "nptg_admin_area_new", key: "admin_area_code" },
    { table: "nptg_locality", newTable: "nptg_locality_new", key: "locality_code" },
    { table: "nptg_region", newTable: "nptg_region_new", key: "region_code" },
];

export const checkTables = async (dbClient: KyselyDb, tables: TableKey[]) => {
    for (const t of tables) {
        const { table, newTable, key } = t;

        const [newCount] = await dbClient
            .selectFrom(`${newTable}`)
            .select(dbClient.fn.count(key).as("count"))
            .execute();

        if (newCount.count === 0 || newCount.count === "0") {
            throw new Error(`No data found in table ${newTable}`);
        }

        const [currentCount] = await dbClient.selectFrom(table).select(dbClient.fn.count(key).as("count")).execute();

        if (currentCount.count === 0 || currentCount.count === "0") {
            logger.info(`Table ${table} is empty, skipping percentage check`);
            continue;
        }

        const percentageResult = (Number(newCount.count) / Number(currentCount.count)) * 100;

        if (t.requiredPercentage && percentageResult < t.requiredPercentage) {
            throw new Error(
                `Tables ${table} and ${newTable} have less than an ${t.requiredPercentage}% match, percentage match: ${percentageResult}%`,
            );
        }

        logger.info(`Table ${newTable} valid with ${newCount.count} rows`);
    }
};

export const renameTables = async (dbClient: KyselyDb, tables: TableKey[]) => {
    for (const { table, newTable } of tables) {
        await dbClient.schema.dropTable(`${table}_old`).ifExists().cascade().execute();
        await dbClient.schema.alterTable(table).renameTo(`${table}_old`).execute();
        await dbClient.schema.alterTable(newTable).renameTo(table).execute();
    }
};

export const handler: Handler = async (event, context) => {
    withLambdaRequestTracker(event ?? {}, context ?? {});

    dbClient = dbClient || (await getDatabaseClient(process.env.STAGE === "local"));

    try {
        await checkTables(dbClient, databaseTables);
        await renameTables(dbClient, databaseTables);
    } catch (e) {
        if (e instanceof Error) {
            logger.error(e, "There was a problem with the Table renamer");
        }

        throw e;
    }
};

process.on("SIGTERM", async () => {
    if (dbClient) {
        logger.info("Destroying DB client...");
        await dbClient.destroy();
    }

    process.exit(0);
});
