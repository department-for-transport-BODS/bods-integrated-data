import {
    CommonPrefix,
    GetObjectCommand,
    ListObjectsV2Command,
    ListObjectsV2CommandInput,
    S3Client,
    _Object,
} from "@aws-sdk/client-s3";
import { KyselyDb, getDatabaseClient } from "@bods-integrated-data/shared/database";
import { errorMapWithDataLogging, logger, withLambdaRequestTracker } from "@bods-integrated-data/shared/logger";
import { listS3Objects, putS3Object } from "@bods-integrated-data/shared/s3";
import { tflBaseVersionSchema } from "@bods-integrated-data/shared/schema";
import { Handler } from "aws-lambda";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { cleardownTables } from "./database";

z.setErrorMap(errorMapWithDataLogging);

const TFL_IBUS_BUCKET_NAME = "ibus.data.tfl.gov.uk";

const getAndParseTflBaseVersionData = async (client: S3Client, bucketName: string, objectKey: string) => {
    const file = await client.send(
        new GetObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
        }),
    );

    const xml = await file.Body?.transformToString();

    if (!xml) {
        throw new Error("No base version xml data");
    }

    const parser = new XMLParser({
        ignoreAttributes: true,
        parseTagValue: false,
    });

    const parsedXml = parser.parse(xml) as Record<string, unknown>;
    const tflJson = tflBaseVersionSchema.safeParse(parsedXml);

    if (!tflJson.success) {
        const validationError = fromZodError(tflJson.error);
        logger.error(validationError.toString());

        throw validationError;
    }

    return tflJson.data;
};

const listTfLS3Objects = async (client: S3Client, commandInput: ListObjectsV2CommandInput) => {
    const objects: _Object[] = [];
    const commonPrefixes: CommonPrefix[] = [];
    let isTruncated = undefined;
    let startAfterKey = undefined;

    do {
        const response = await client.send(
            new ListObjectsV2Command({
                ...commandInput,
                StartAfter: startAfterKey,
            }),
        );

        if (response.Contents) {
            objects.push(...response.Contents);

            startAfterKey = objects[objects.length - 1].Key;
        }

        if (response.CommonPrefixes) {
            commonPrefixes.push(...response.CommonPrefixes);
        }

        isTruncated = response.IsTruncated;
    } while (isTruncated);

    return { objects, commonPrefixes };
};

export type TflTimetableRetrieverOutput = {
    tflTimetableZippedBucketName: string;
    prefix: string;
};

let dbClient: KyselyDb;

export const handler: Handler = async (event, context): Promise<TflTimetableRetrieverOutput> => {
    withLambdaRequestTracker(event ?? {}, context ?? {});

    try {
        const { TFL_TIMETABLE_ZIPPED_BUCKET_NAME } = process.env;

        if (!TFL_TIMETABLE_ZIPPED_BUCKET_NAME) {
            throw new Error("Missing env vars - TFL_TIMETABLE_ZIPPED_BUCKET_NAME must be set");
        }

        dbClient = dbClient || (await getDatabaseClient(process.env.STAGE === "local"));

        const tflS3Client = new S3Client({
            region: "eu-west-1",
            endpoint: "https://s3.eu-west-1.amazonaws.com",
        });

        await cleardownTables(dbClient);

        const tflBaseVersionData = await getAndParseTflBaseVersionData(
            tflS3Client,
            TFL_IBUS_BUCKET_NAME,
            "Base_Version.xml",
        );

        const baseVersion = tflBaseVersionData["bv:Versioning_Of_Data"].Base_Version;
        const prefix = `Base_Version_${baseVersion}/`;

        const functionOutput: TflTimetableRetrieverOutput = {
            tflTimetableZippedBucketName: TFL_TIMETABLE_ZIPPED_BUCKET_NAME,
            prefix,
        };

        logger.info(`Selected base version: "${prefix}"`);

        const ourBaseVersionObjects = await listS3Objects({
            Bucket: TFL_TIMETABLE_ZIPPED_BUCKET_NAME,
            Delimiter: "/",
        });

        const ourBaseVersionPrefixes = ourBaseVersionObjects.CommonPrefixes || [];

        for (const commonPrefix of ourBaseVersionPrefixes) {
            if (commonPrefix.Prefix === prefix) {
                logger.warn(`Prefix "${prefix}" already exists, skipping retrieval`);
                return functionOutput;
            }
        }

        const tflTimetableObjects = await listTfLS3Objects(tflS3Client, {
            Bucket: TFL_IBUS_BUCKET_NAME,
            Prefix: prefix,
        });

        // Skip non-zip keys such as zero-byte folder markers (e.g. "Base_Version_X/UN/"), which fail in the unzipper
        const zipObjects = tflTimetableObjects.objects.filter(({ Key }) => Key?.toLowerCase().endsWith(".zip"));

        logger.info(`Retrieving ${zipObjects.length} files`);

        for await (const { Key } of zipObjects) {
            if (Key) {
                const object = await tflS3Client.send(
                    new GetObjectCommand({
                        Bucket: TFL_IBUS_BUCKET_NAME,
                        Key,
                    }),
                );

                const body = await object.Body?.transformToByteArray();

                await putS3Object({
                    Bucket: TFL_TIMETABLE_ZIPPED_BUCKET_NAME,
                    Key,
                    Body: body,
                });
            }
        }

        return functionOutput;
    } catch (e) {
        if (e instanceof Error) {
            logger.error(e, "There was a problem with the TfL timetable retriever function");
        }

        throw e;
    }
};
