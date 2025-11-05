import { randomUUID } from "node:crypto";
import { buffer } from "node:stream/consumers";
import {
    getAvlErrorDetails,
    getAvlSubscription,
    insertAvlCancellations,
    insertAvls,
} from "@bods-integrated-data/shared/avl/utils";
import { KyselyDb, getDatabaseClient } from "@bods-integrated-data/shared/database";
import { getDate } from "@bods-integrated-data/shared/dates";
import { putDynamoItems } from "@bods-integrated-data/shared/dynamo";
import { addMatchingTripToAvl } from "@bods-integrated-data/shared/gtfs-rt/utils";
import { errorMapWithDataLogging, logger, withLambdaRequestTracker } from "@bods-integrated-data/shared/logger";
import { createLazyDownloadStreamFrom } from "@bods-integrated-data/shared/s3";
import { siriSchemaTransformed } from "@bods-integrated-data/shared/schema";
import { AvlValidationError } from "@bods-integrated-data/shared/schema/avl-validation-error.schema";
import { S3Event, S3EventRecord, SQSHandler } from "aws-lambda";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

z.setErrorMap(errorMapWithDataLogging);

let dbClient: KyselyDb;

const arrayProperties = ["VehicleActivity", "OnwardCall", "VehicleActivityCancellation"];

const parseXml = (xml: string, errors: AvlValidationError[]) => {
    const parser = new XMLParser({
        allowBooleanAttributes: true,
        ignoreAttributes: true,
        parseTagValue: false,
        isArray: (tagName) => arrayProperties.includes(tagName),
    });

    const parsedXml = parser.parse(xml);
    const parsedJson = siriSchemaTransformed(errors).safeParse(parsedXml);

    if (!parsedJson.success) {
        logger.error(`There was an error parsing the AVL data: ${parsedJson.error.format()}`);
        errors.push(
            ...parsedJson.error.errors.map<AvlValidationError>((error) => {
                const { name, message, level } = getAvlErrorDetails(error);

                return {
                    PK: "",
                    SK: randomUUID(),
                    details: message,
                    filename: "",
                    level,
                    name,
                    timeToExist: 0,
                };
            }),
        );
    }

    return {
        responseTimestamp: parsedXml?.Siri?.ServiceDelivery?.ResponseTimestamp,
        avls: parsedJson.success ? parsedJson.data.avls : [],
        avlCancellations: parsedJson.success ? parsedJson.data.avlCancellations : [],
    };
};

const uploadValidationErrorsToDatabase = async (
    subscriptionId: string,
    filename: string,
    tableName: string,
    errors: AvlValidationError[],
    responseTimestamp?: string,
) => {
    const timeToExist = getDate().add(3, "days").unix();

    for (const error of errors) {
        error.PK = subscriptionId;
        error.filename = filename;
        error.responseTimestamp = responseTimestamp;
        error.timeToExist = timeToExist;
    }

    await putDynamoItems(tableName, errors);
};

export const processSqsRecord = async (
    record: S3EventRecord,
    dbClient: KyselyDb,
    avlSubscriptionTableName: string,
    avlValidationErrorTableName: string,
    gtfsTripMapsTableName: string,
) => {
    try {
        const subscriptionId = record.s3.object.key.substring(0, record.s3.object.key.indexOf("/"));
        logger.subscriptionId = subscriptionId;

        const subscription = await getAvlSubscription(subscriptionId, avlSubscriptionTableName);

        if (subscription.status === "inactive") {
            logger.warn(`Subscription ${subscriptionId} is inactive, data will not be processed.`, {
                subscriptionId,
            });
            throw new Error(`Unable to process AVL for subscription ${subscriptionId} because it is inactive`);
        }

        const stream = createLazyDownloadStreamFrom(record.s3.bucket.name, record.s3.object.key);

        const body = (await buffer(stream)).toString();

        if (body) {
            const errors: AvlValidationError[] = [];
            const { responseTimestamp, avls, avlCancellations } = parseXml(body, errors);

            if (errors.length > 0) {
                await uploadValidationErrorsToDatabase(
                    subscriptionId,
                    record.s3.object.key,
                    avlValidationErrorTableName,
                    errors,
                    responseTimestamp,
                );
            }

            const enrichedAvls = await Promise.all(avls.map((avl) => addMatchingTripToAvl(gtfsTripMapsTableName, avl)));

            const totalAvlCount = enrichedAvls.length;

            if (totalAvlCount > 0) {
                await insertAvls(dbClient, enrichedAvls, subscriptionId);
                logger.info("AVL processed successfully", {
                    subscriptionId,
                });
            }

            if (process.env.ENABLE_CANCELLATIONS === "true" && avlCancellations.length > 0) {
                await insertAvlCancellations(dbClient, avlCancellations, subscriptionId);
                logger.info("AVL cancellations processed successfully", {
                    subscriptionId,
                });
            }

            if (totalAvlCount === 0 && avlCancellations.length === 0) {
                logger.warn("No VehicleActivity or VehicleActivityCancellation was provided in SIRI-VM message", {
                    subscriptionId,
                });
            }
        }
    } catch (e) {
        logger.error(`AVL processing failed for file ${record.s3.object.key}`);

        throw e;
    }
};

export const handler: SQSHandler = async (event, context) => {
    withLambdaRequestTracker(event ?? {}, context ?? {});

    const { AVL_SUBSCRIPTION_TABLE_NAME, AVL_VALIDATION_ERROR_TABLE_NAME, GTFS_TRIP_MAPS_TABLE_NAME } = process.env;

    if (!AVL_SUBSCRIPTION_TABLE_NAME || !AVL_VALIDATION_ERROR_TABLE_NAME || !GTFS_TRIP_MAPS_TABLE_NAME) {
        throw new Error(
            "Missing env vars: AVL_SUBSCRIPTION_TABLE_NAME, AVL_VALIDATION_ERROR_TABLE_NAME and GTFS_TRIP_MAPS_TABLE_NAME must be set.",
        );
    }

    dbClient = dbClient || (await getDatabaseClient(process.env.STAGE === "local"));

    try {
        logger.info(`Starting processing of SIRI-VM. Number of records to process: ${event.Records.length}`);

        await Promise.all(
            event.Records.map((record) =>
                Promise.all(
                    (JSON.parse(record.body) as S3Event).Records.map((s3Record) =>
                        processSqsRecord(
                            s3Record,
                            dbClient,
                            AVL_SUBSCRIPTION_TABLE_NAME,
                            AVL_VALIDATION_ERROR_TABLE_NAME,
                            GTFS_TRIP_MAPS_TABLE_NAME,
                        ),
                    ),
                ),
            ),
        );
    } catch (e) {
        if (e instanceof Error) {
            logger.error(e, "AVL Processor has failed");
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
