import cleanDeep from "clean-deep";
import { sync as commandExistsSync } from "command-exists";
import { Dayjs } from "dayjs";
import { XMLBuilder } from "fast-xml-parser";
import { sql } from "kysely";
import { ZodIssue } from "zod";
import { fromZodIssue } from "zod-validation-error";
import { putMetricData } from "../cloudwatch";
import { KyselyDb, NewSituation, Situation } from "../database";
import { getDate } from "../dates";
import { getDynamoItem, recursiveScan } from "../dynamo";
import { logger } from "../logger";
import { putS3Object } from "../s3";
import { SiriSx, siriSxSchemaWrapper } from "../schema";
import {
    CancellationsSubscription,
    cancellationsSubscriptionSchema,
    cancellationsSubscriptionsSchema,
} from "../schema/cancellations-subscribe.schema";
import { CompleteSiriObject, SubscriptionIdNotFoundError, chunkArray, formatSiriDatetime, runXmlLint } from "../utils";

export const GENERATED_SIRI_SX_FILE_PATH = "SIRI-SX.xml";

export const getCancellationsSubscriptions = async (tableName: string) => {
    const subscriptions = await recursiveScan({
        TableName: tableName,
    });

    if (!subscriptions) {
        return [];
    }

    return cancellationsSubscriptionsSchema.parse(subscriptions);
};

export const getCancellationsSubscription = async (subscriptionId: string, tableName: string) => {
    const subscription = await getDynamoItem<CancellationsSubscription>(tableName, {
        PK: subscriptionId,
        SK: "SUBSCRIPTION",
    });

    if (!subscription) {
        throw new SubscriptionIdNotFoundError(`Subscription ID: ${subscriptionId} not found in DynamoDB`);
    }

    return cancellationsSubscriptionSchema.parse(subscription);
};

export const insertSituations = async (dbClient: KyselyDb, cancellations: NewSituation[]) => {
    const insertChunks = chunkArray(cancellations, 1000);

    await Promise.all(
        insertChunks.map((chunk) =>
            dbClient
                .insertInto("situation")
                .values(chunk)
                .onConflict((oc) =>
                    oc.column("id").doUpdateSet((eb) => ({
                        subscription_id: eb.ref("excluded.subscription_id"),
                        response_time_stamp: eb.ref("excluded.response_time_stamp"),
                        producer_ref: eb.ref("excluded.producer_ref"),
                        situation_number: eb.ref("excluded.situation_number"),
                        version: eb.ref("excluded.version"),
                        situation: eb.ref("excluded.situation"),
                    })),
                )
                .execute(),
        ),
    );
};

export const createSiriSx = (situations: Situation[], requestMessageRef: string, responseTime: Dayjs) => {
    const currentTime = formatSiriDatetime(responseTime, true);

    const siriSx: SiriSx = {
        Siri: {
            ServiceDelivery: {
                ResponseTimestamp: currentTime,
                ProducerRef: "DepartmentForTransport",
                ResponseMessageIdentifier: requestMessageRef,
                SituationExchangeDelivery: {
                    ResponseTimestamp: currentTime,
                    Situations: {
                        PtSituationElement: situations.map((situation) => ({
                            ...situation.situation,
                            SituationNumber: situation.display_id,
                        })),
                    },
                },
            },
        },
    };

    const siriSxWithoutEmptyFields = cleanDeep(siriSx, { emptyObjects: false, emptyArrays: false });

    const { siriSxSchema } = siriSxSchemaWrapper();

    const verifiedObject = siriSxSchema.parse(siriSxWithoutEmptyFields);

    const completeObject: Partial<CompleteSiriObject<SiriSx["Siri"]>> = {
        Siri: {
            "@_version": "2.0",
            "@_xmlns": "http://www.siri.org.uk/siri",
            "@_xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "@_xsi:schemaLocation": "http://www.siri.org.uk/siri http://www.siri.org.uk/schema/2.0/xsd/siri.xsd",
            ...verifiedObject.Siri,
        },
    };

    const builder = new XMLBuilder({
        ignoreAttributes: false,
        format: false,
        attributeNamePrefix: "@_",
    });

    const request = builder.build(completeObject) as string;

    return request;
};

const createAndValidateSiriSx = async (
    situations: Situation[],
    requestMessageRef: string,
    responseTime: Dayjs,
    lintSiri: boolean,
) => {
    const siriSx = createSiriSx(situations, requestMessageRef, responseTime);

    if (lintSiri) {
        try {
            await runXmlLint(siriSx);
        } catch (e) {
            await putMetricData("custom/SiriSxGenerator", [{ MetricName: "ValidationError", Value: 1 }]);

            logger.error(e);

            throw e;
        }
    }

    return siriSx;
};

export const generateSiriSxAndUploadToS3 = async (
    situations: Situation[],
    requestMessageRef: string,
    bucketName: string,
    lintSiri = true,
) => {
    if (lintSiri && !commandExistsSync("xmllint")) {
        throw new Error("xmllint not available");
    }

    const responseTime = getDate();

    const siriSx = await Promise.resolve(
        createAndValidateSiriSx(situations, requestMessageRef, responseTime, lintSiri),
    );

    await putS3Object({
        Bucket: bucketName,
        Key: GENERATED_SIRI_SX_FILE_PATH,
        ContentType: "application/xml",
        Body: siriSx,
    });
};

const getQueryForSituations = (dbClient: KyselyDb, subscriptionId?: string[]) => {
    let query = dbClient.selectFrom("situation").distinctOn(["subscription_id", "situation_number"]).selectAll();

    if (subscriptionId) {
        query = query.where("subscription_id", "in", subscriptionId);
    }

    return query.orderBy(["subscription_id", "situation_number", sql<string>`version DESC NULLS LAST`]);
};

export const getSituationsDataForSiriSx = async (dbClient: KyselyDb, subscriptionId?: string[]) => {
    try {
        const query = getQueryForSituations(dbClient, subscriptionId);

        const situations = await query.execute();

        return situations;
    } catch (e) {
        if (e instanceof Error) {
            logger.error(e, "There was a problem getting Situations data from the database");
        }

        throw e;
    }
};

export const getCancellationErrorDetails = (error: ZodIssue) => {
    const validationError = fromZodIssue(error, { prefix: null, includePath: false });
    const details = validationError.details[0];
    let name = details.path.join(".");
    let message = validationError.message;

    if (details.code === "invalid_union") {
        const paths = details.unionErrors.map((unionError) => {
            const unionValidationError = fromZodIssue(unionError.errors[0], { prefix: null, includePath: false });
            return unionValidationError.details[0].path.join(".");
        });

        name = paths.join(", ");
        message = `Required one of ${name}`;
    }

    return { name, message };
};
