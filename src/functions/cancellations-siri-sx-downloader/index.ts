import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
    createHttpServerErrorResponse,
    createHttpSuccessResponse,
    createHttpValidationErrorResponse,
} from "@bods-integrated-data/shared/api";
import {
    GENERATED_SIRI_SX_FILE_PATH,
    createSiriSx,
    getSituationsDataForSiriSx,
} from "@bods-integrated-data/shared/cancellations/utils";
import { KyselyDb, getDatabaseClient } from "@bods-integrated-data/shared/database";
import { getDate } from "@bods-integrated-data/shared/dates";
import { logger, withLambdaRequestTracker } from "@bods-integrated-data/shared/logger";
import { getS3Object } from "@bods-integrated-data/shared/s3";
import { createStringArrayValidation } from "@bods-integrated-data/shared/validation";
import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { ZodError, z } from "zod";

let dbClient: KyselyDb;

const requestParamsSchema = z.preprocess(
    Object,
    z.object({
        subscriptionId: createStringArrayValidation("subscriptionId").optional(),
    }),
);

const retrieveSiriSxData = async (dbClient: KyselyDb, subscriptionId?: string[]) => {
    const situations = await getSituationsDataForSiriSx(dbClient, subscriptionId);
    const requestMessageRef = randomUUID();
    const responseTime = getDate();

    return createSiriSx(situations, requestMessageRef, responseTime);
};

const retrieveSiriSxFile = async (bucketName: string, key: string): Promise<string> => {
    const object = await getS3Object({
        Bucket: bucketName,
        Key: key,
        ResponseContentType: "application/xml",
    });

    return object.Body?.transformToString() || "";
};

export const handler: APIGatewayProxyHandler = async (event, context): Promise<APIGatewayProxyResult> => {
    withLambdaRequestTracker(event ?? {}, context ?? {});

    try {
        if (event.path === "health") {
            return createHttpSuccessResponse();
        }

        const { BUCKET_NAME: bucketName } = process.env;

        if (!bucketName) {
            throw new Error("Missing env vars - BUCKET_NAME must be set");
        }

        let siriSx: string;

        logger.info(`Invoking siri-sx downloader, query params: ${JSON.stringify(event.queryStringParameters)}`);

        const { subscriptionId } = requestParamsSchema.parse(event.queryStringParameters);

        if (subscriptionId) {
            dbClient = dbClient || (await getDatabaseClient(process.env.STAGE === "local"));

            siriSx = await retrieveSiriSxData(dbClient, subscriptionId);
        } else {
            siriSx = await retrieveSiriSxFile(bucketName, GENERATED_SIRI_SX_FILE_PATH);
        }

        const gzip = gzipSync(siriSx);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/xml", "Content-Encoding": "gzip" },
            body: gzip.toString("base64"),
            isBase64Encoded: true,
        };
    } catch (e) {
        if (e instanceof ZodError) {
            logger.warn(`Invalid request: ${JSON.stringify(event.queryStringParameters)}`);
            logger.warn(e);
            return createHttpValidationErrorResponse(e.errors.map((error) => error.message));
        }

        if (e instanceof Error) {
            logger.error(e, "There was a problem with the siri-sx downloader endpoint");
        }

        return createHttpServerErrorResponse();
    }
};

process.on("SIGTERM", async () => {
    if (dbClient) {
        logger.info("Destroying DB client...");
        await dbClient.destroy();
    }

    process.exit(0);
});
