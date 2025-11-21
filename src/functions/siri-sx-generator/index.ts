import { randomUUID } from "node:crypto";
import {
    generateSiriSxAndUploadToS3,
    getSituationsDataForSiriSx,
} from "@bods-integrated-data/shared/cancellations/utils";
import { KyselyDb, getDatabaseClient } from "@bods-integrated-data/shared/database";
import { logger } from "@bods-integrated-data/shared/logger";

let dbClient: KyselyDb;

export const handler = async () => {
    try {
        const isLocal = process.env.STAGE === "local";

        dbClient = dbClient || (await getDatabaseClient(isLocal, true));

        logger.info("Starting SIRI-SX file generator");

        const { BUCKET_NAME: bucketName } = process.env;

        if (!bucketName) {
            throw new Error("Missing env vars - BUCKET_NAME must be set");
        }

        const requestMessageRef = randomUUID();
        const situations = await getSituationsDataForSiriSx(dbClient);

        await generateSiriSxAndUploadToS3(situations, requestMessageRef, bucketName, !isLocal);

        logger.info("Successfully uploaded SIRI-SX data to S3");
    } catch (e) {
        if (e instanceof Error) {
            logger.error(e, "Error generating SIRI-SX file");
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
