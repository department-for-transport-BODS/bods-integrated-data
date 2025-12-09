import path from "node:path";
import { PassThrough } from "node:stream";
import { GTFS_FILE_SUFFIX } from "@bods-integrated-data/shared/constants";
import { KyselyDb, getDatabaseClient } from "@bods-integrated-data/shared/database";
import { errorMapWithDataLogging, logger, withLambdaRequestTracker } from "@bods-integrated-data/shared/logger";
import {
    createLazyDownloadStreamFrom,
    getS3Object,
    listS3Objects,
    startS3Upload,
} from "@bods-integrated-data/shared/s3";
import { regionCodeSchema } from "@bods-integrated-data/shared/schema/misc.schema";
import archiver from "archiver";
import { Handler } from "aws-lambda";
import { z } from "zod";
import {
    Files,
    GtfsFile,
    createEnglandTripTable,
    createRegionalTripTable,
    createTripTable,
    dropRegionalTripTable,
    exportDataToS3,
    queryBuilder,
} from "./data";

z.setErrorMap(errorMapWithDataLogging);

let dbClient: KyselyDb;

/**
 * Checks if any of the generated files in the GTFS bucket are empty (not including headers)
 * and excludes them from the zip file
 *
 * @param outputBucket
 * @param filePath
 * @param queries
 * @returns
 */
export const ignoreEmptyFiles = async (outputBucket: string, filePath: string, files: GtfsFile[]) => {
    const newFiles: GtfsFile[] = files.map((file) => ({
        fileName: file.fileName,
        include: file.include,
    }));

    const objects = await listS3Objects({
        Bucket: outputBucket,
        Prefix: filePath,
    });

    const smallObjects = objects.Contents?.filter((o) => o.Size && o.Size < 500) ?? [];

    for (const object of smallObjects) {
        const { Body: body } = await getS3Object({
            Bucket: outputBucket,
            Key: object.Key,
        });

        const contents = (await body?.transformToString()) ?? "";
        const rows = contents.split("\n").filter((row) => row !== "");

        if (rows.length <= 1) {
            logger.warn(`CSV empty: ${object.Key}`);
            const queryIndex = files.findIndex((q) => q.fileName === path.basename(object.Key ?? "", ".txt"));

            if (queryIndex > -1) {
                logger.info(`Excluding ${object.Key} from generated GTFS`);

                newFiles[queryIndex].include = false;
            }
        }
    }

    return newFiles;
};

export const createGtfsZip = async (gtfsBucket: string, outputBucket: string, filePath: string, files: GtfsFile[]) => {
    const archive = archiver("zip");

    try {
        const passThrough = new PassThrough();
        archive.pipe(passThrough);
        const upload = startS3Upload(gtfsBucket, `${filePath}.zip`, passThrough, "application/zip");

        for (const file of files) {
            if (file.include) {
                const fileNameWithExt = `${file.fileName}.txt`;
                const downloadStream = createLazyDownloadStreamFrom(outputBucket, `${filePath}/${fileNameWithExt}`);

                archive.append(downloadStream, {
                    name: fileNameWithExt,
                });
            }
        }

        archive.finalize();
        await upload.done();
    } catch (e) {
        archive.abort();
        throw e;
    }
};

export const tripTableHandler: Handler = async (event, context) => {
    withLambdaRequestTracker(event ?? {}, context ?? {});

    const { STAGE: stage } = process.env;

    dbClient = dbClient || (await getDatabaseClient(stage === "local"));

    const regionCode = regionCodeSchema.parse(event?.regionCode ?? "ALL");

    try {
        logger.info("Starting GTFS Trip Table Creator");

        if (regionCode === "ALL") {
            logger.info("Creating national trip table");
            await createTripTable(dbClient);
        } else {
            logger.info(`Creating regional trip table for region: ${regionCode}`);

            await dropRegionalTripTable(dbClient, regionCode);
            await createRegionalTripTable(dbClient, regionCode);
        }

        logger.info("GTFS Trip Table Creator successful");
    } catch (e) {
        if (e instanceof Error) {
            logger.error(e, "There was a problem with the GTFS Timetable Generator");
        }

        throw e;
    }
};

export const englandTripTableHandler: Handler = async (event, context) => {
    withLambdaRequestTracker(event ?? {}, context ?? {});

    const { STAGE: stage } = process.env;

    dbClient = dbClient || (await getDatabaseClient(stage === "local"));

    try {
        logger.info("Starting GTFS England Trip Table Creator");

        await dropRegionalTripTable(dbClient, "E");

        logger.info("Creating regional trip table for region: E");

        await createEnglandTripTable(dbClient);

        logger.info("GTFS England Trip Table Creator successful");
    } catch (e) {
        if (e instanceof Error) {
            logger.error(e, "There was a problem with the GTFS Timetable Generator");
        }

        throw e;
    }
};

export const exportHandler: Handler = async (event, context) => {
    withLambdaRequestTracker(event ?? {}, context ?? {});

    const { OUTPUT_BUCKET: outputBucket, STAGE: stage } = process.env;

    if (!outputBucket) {
        throw new Error("Env vars must be set");
    }

    dbClient = dbClient || (await getDatabaseClient(stage === "local"));

    const regionCode = regionCodeSchema.parse(event?.regionCode ?? "ALL");

    try {
        logger.info(`Starting GTFS Timetable Generator for region: ${regionCode}`);

        const queries = queryBuilder(dbClient, regionCode);

        const filePath = `${regionCode.toLowerCase()}${GTFS_FILE_SUFFIX}`;

        await exportDataToS3(queries, outputBucket, dbClient, filePath);

        logger.info("GTFS Timetable Generator successful");
    } catch (e) {
        if (e instanceof Error) {
            logger.error(e, "There was a problem with the GTFS Timetable Generator");
        }

        throw e;
    } finally {
        logger.info(`Dropping region table: trip_${regionCode}`);

        if (regionCode !== "ALL") {
            await dropRegionalTripTable(dbClient, regionCode);
        }
    }
};

export const zipHandler: Handler = async (event, context) => {
    withLambdaRequestTracker(event ?? {}, context ?? {});

    const { OUTPUT_BUCKET: outputBucket, GTFS_BUCKET: gtfsBucket } = process.env;

    if (!outputBucket || !gtfsBucket) {
        throw new Error("Env vars must be set");
    }

    const regionCode = regionCodeSchema.parse(event?.regionCode ?? "ALL");

    try {
        logger.info(`Starting GTFS Timetable Zipper for region: ${regionCode}`);

        let files = Object.values(Files).map<GtfsFile>((file) => ({
            fileName: file,
            include: true,
        }));

        const filePath = `${regionCode.toLowerCase()}${GTFS_FILE_SUFFIX}`;

        if (regionCode !== "ALL") {
            files = await ignoreEmptyFiles(outputBucket, filePath, files);
        }

        await createGtfsZip(gtfsBucket, outputBucket, filePath, files);

        logger.info("GTFS Timetable Zipper successful");
    } catch (e) {
        if (e instanceof Error) {
            logger.error(e, "There was a problem with the GTFS Timetable Zipper");
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
