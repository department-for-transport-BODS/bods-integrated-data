import * as crypto from "node:crypto";
import * as cloudwatch from "@bods-integrated-data/shared/cloudwatch";
import { KyselyDb } from "@bods-integrated-data/shared/database";
import { getDate } from "@bods-integrated-data/shared/dates";
import * as dynamo from "@bods-integrated-data/shared/dynamo";
import { AvlSubscription } from "@bods-integrated-data/shared/schema/avl-subscribe.schema";
import { AvlValidationError } from "@bods-integrated-data/shared/schema/avl-validation-error.schema";
import { S3EventRecord } from "aws-lambda";
import MockDate from "mockdate";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { processSqsRecord } from ".";
import {
    mockItemId,
    mockSubscriptionId,
    parsedSiri,
    parsedSiriWithCancellationsOnly,
    parsedSiriWithOnwardCalls,
    testInvalidSiri,
    testSiri,
    testSiriWithCancellationsOnly,
    testSiriWithDuplicates,
    testSiriWithInvalidVehicleActivities,
    testSiriWithLocationsAndCancellations,
    testSiriWithOnwardCalls,
    testSiriWithValidAndInvalidData,
} from "./test/testSiriVm";

describe("avl-processor", () => {
    const mocks = vi.hoisted(() => {
        return {
            getS3Object: vi.fn(),
        };
    });

    vi.mock("node:crypto", () => ({
        randomUUID: vi.fn(),
    }));

    vi.mock("@bods-integrated-data/shared/cloudwatch", () => ({
        putMetricData: vi.fn(),
    }));

    vi.mock("@bods-integrated-data/shared/s3", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@bods-integrated-data/shared/s3")>()),
        getS3Object: mocks.getS3Object,
    }));

    vi.mock("@bods-integrated-data/shared/dynamo", () => ({
        getDynamoItem: vi.fn(),
        putDynamoItems: vi.fn(),
    }));

    MockDate.set("2024-07-22T12:00:00.000Z");
    const uuidSpy = vi.spyOn(crypto, "randomUUID");
    const getDynamoItemSpy = vi.spyOn(dynamo, "getDynamoItem");
    const putDynamoItemsSpy = vi.spyOn(dynamo, "putDynamoItems");
    const putMetricDataSpy = vi.spyOn(cloudwatch, "putMetricData");

    const valuesMock = vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue(""),
        returning: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue({
                id: 123,
            }),
        }),
    });

    const dbClient = {
        insertInto: () => ({
            values: vi.fn().mockReturnValue({
                onConflict: valuesMock,
            }),
        }),
    };

    const record = {
        s3: {
            bucket: {
                name: "test-bucket",
            },
            object: {
                key: `${mockSubscriptionId}/test-key`,
            },
        },
    };

    const mockAvlSubscriptionTableName = "avl-subscription-table";
    const mockAvlValidationErrorsTableName = "avl-validation-errors-table";
    const mockGtfsTripMapsTableName = "gtfs-trip-maps-table";

    beforeAll(() => {
        process.env.STAGE = "dev";
        process.env.ENABLE_CANCELLATIONS = "true";
    });

    afterAll(() => {
        MockDate.reset();
    });

    beforeEach(() => {
        vi.resetAllMocks();

        const avlSubscription: AvlSubscription = {
            PK: "411e4495-4a57-4d2f-89d5-cf105441f321",
            url: "https://mock-data-producer.com/",
            description: "test-description",
            shortDescription: "test-short-description",
            status: "live",
            requestorRef: null,
            publisherId: "test-publisher-id",
            apiKey: "mock-api-key",
        };

        getDynamoItemSpy.mockResolvedValue(avlSubscription);
        uuidSpy.mockReturnValue(mockItemId);
    });

    it.each(["live", "error"] as const)(
        "correctly processes a siri-vm file when subscription has status of %o",
        async (status) => {
            const avlSubscription: AvlSubscription = {
                PK: "411e4495-4a57-4d2f-89d5-cf105441f321",
                url: "https://mock-data-producer.com/",
                description: "test-description",
                shortDescription: "test-short-description",
                status,
                requestorRef: null,
                publisherId: "test-publisher-id",
                apiKey: "mock-api-key",
            };

            getDynamoItemSpy.mockResolvedValue(avlSubscription);

            const valuesMock = vi.fn().mockReturnValue({
                onConflict: vi.fn().mockReturnValue({
                    execute: vi.fn().mockResolvedValue(""),
                }),
            });

            const dbClient = {
                insertInto: () => ({
                    values: valuesMock,
                }),
            };

            mocks.getS3Object.mockResolvedValueOnce({ Body: { transformToString: () => testSiri } });
            await processSqsRecord(
                record as S3EventRecord,
                dbClient as unknown as KyselyDb,
                mockAvlSubscriptionTableName,
                mockAvlValidationErrorsTableName,
                mockGtfsTripMapsTableName,
            );

            expect(uuidSpy).toHaveBeenCalledOnce();
            expect(valuesMock).toBeCalledWith(parsedSiri);
        },
    );

    it("correctly processes a siri-vm file with OnwardCalls data", async () => {
        const valuesMock = vi.fn().mockReturnValue({
            onConflict: vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue(""),
                returning: vi.fn().mockReturnValue({
                    executeTakeFirst: vi.fn().mockResolvedValue({
                        id: 123,
                    }),
                }),
            }),
        });

        const dbClient = {
            insertInto: () => ({
                values: valuesMock,
            }),
        };

        mocks.getS3Object.mockResolvedValueOnce({ Body: { transformToString: () => testSiriWithOnwardCalls } });
        await processSqsRecord(
            record as S3EventRecord,
            dbClient as unknown as KyselyDb,
            mockAvlSubscriptionTableName,
            mockAvlValidationErrorsTableName,
            mockGtfsTripMapsTableName,
        );

        expect(valuesMock).toHaveBeenCalledWith(parsedSiriWithOnwardCalls);
    });

    it("correctly handles a siri-vm file with only VehicleActivityCancellation data", async () => {
        const valuesMock = vi.fn().mockReturnValue({
            onConflict: vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue(""),
                returning: vi.fn().mockReturnValue({
                    executeTakeFirst: vi.fn().mockResolvedValue({
                        id: 123,
                    }),
                }),
            }),
        });

        const dbClient = {
            insertInto: () => ({
                values: valuesMock,
            }),
        };

        mocks.getS3Object.mockResolvedValueOnce({ Body: { transformToString: () => testSiriWithCancellationsOnly } });
        await processSqsRecord(
            record as S3EventRecord,
            dbClient as unknown as KyselyDb,
            mockAvlSubscriptionTableName,
            mockAvlValidationErrorsTableName,
            mockGtfsTripMapsTableName,
        );

        expect(valuesMock).toHaveBeenCalledWith(parsedSiriWithCancellationsOnly);
    });

    it("correctly handles a siri-vm file with both VehicleActivity and VehicleActivityCancellation data", async () => {
        const valuesMock = vi.fn().mockReturnValue({
            onConflict: vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue(""),
                returning: vi.fn().mockReturnValue({
                    executeTakeFirst: vi.fn().mockResolvedValue({
                        id: 123,
                    }),
                }),
            }),
        });

        const dbClient = {
            insertInto: () => ({
                values: valuesMock,
            }),
        };

        mocks.getS3Object.mockResolvedValueOnce({
            Body: { transformToString: () => testSiriWithLocationsAndCancellations },
        });
        await processSqsRecord(
            record as S3EventRecord,
            dbClient as unknown as KyselyDb,
            mockAvlSubscriptionTableName,
            mockAvlValidationErrorsTableName,
            mockGtfsTripMapsTableName,
        );

        expect(valuesMock).toHaveBeenCalledTimes(2);
        expect(valuesMock).toBeCalledWith([parsedSiri[0]]);
        expect(valuesMock).toBeCalledWith(parsedSiriWithCancellationsOnly);
    });

    it("correctly removes duplicates before inserting into the db", async () => {
        const valuesMock = vi.fn().mockReturnValue({
            onConflict: vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue(""),
            }),
        });

        const dbClient = {
            insertInto: () => ({
                values: valuesMock,
            }),
        };

        mocks.getS3Object.mockResolvedValueOnce({ Body: { transformToString: () => testSiriWithDuplicates } });
        await processSqsRecord(
            record as S3EventRecord,
            dbClient as unknown as KyselyDb,
            mockAvlSubscriptionTableName,
            mockAvlValidationErrorsTableName,
            mockGtfsTripMapsTableName,
        );

        expect(uuidSpy).toHaveBeenCalledOnce();

        expect(valuesMock).toBeCalledWith([parsedSiri[0]]);
    });

    it("does not insert to database if invalid siri", async () => {
        mocks.getS3Object.mockResolvedValueOnce({
            Body: { transformToString: () => testInvalidSiri },
        });

        await processSqsRecord(
            record as S3EventRecord,
            dbClient as unknown as KyselyDb,
            mockAvlSubscriptionTableName,
            mockAvlValidationErrorsTableName,
            mockGtfsTripMapsTableName,
        );

        expect(valuesMock).not.toHaveBeenCalled();
    });

    it("does not insert to database if only invalid vehicle activities", async () => {
        mocks.getS3Object.mockResolvedValueOnce({
            Body: { transformToString: () => testSiriWithInvalidVehicleActivities },
        });

        await processSqsRecord(
            record as S3EventRecord,
            dbClient as unknown as KyselyDb,
            mockAvlSubscriptionTableName,
            mockAvlValidationErrorsTableName,
            mockGtfsTripMapsTableName,
        );

        expect(valuesMock).not.toHaveBeenCalled();
    });

    it("filters out invalid data and only inserts valid data", async () => {
        const valuesMock = vi.fn().mockReturnValue({
            onConflict: vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue(""),
                returning: vi.fn().mockReturnValue({
                    executeTakeFirst: vi.fn().mockResolvedValue({
                        id: 123,
                    }),
                }),
            }),
        });

        const dbClient = {
            insertInto: () => ({
                values: valuesMock,
            }),
        };

        mocks.getS3Object.mockResolvedValueOnce({
            Body: { transformToString: () => testSiriWithValidAndInvalidData },
        });

        const timeToExist = getDate().add(3, "days").unix();

        const expectedValidationErrors: AvlValidationError[] = [
            {
                PK: mockSubscriptionId,
                SK: "12a345b6-2be9-49bb-852f-21e5a2400ea6",
                details:
                    "LineRef must be 1-256 characters and only contain letters, numbers, periods, hyphens, underscores and colons",
                filename: record.s3.object.key,
                level: "CRITICAL",
                lineRef: "Invalid$",
                name: "Siri.ServiceDelivery.VehicleMonitoringDelivery.VehicleActivity.1.MonitoredVehicleJourney.LineRef",
                operatorRef: "123",
                recordedAtTime: "2018-08-17T15:22:20",
                responseTimestamp: "2018-08-17T15:14:21.432",
                timeToExist,
                vehicleRef: "200141",
            },
            {
                PK: "123",
                SK: "12a345b6-2be9-49bb-852f-21e5a2400ea6",
                details:
                    "LineRef must be 1-256 characters and only contain letters, numbers, periods, hyphens, underscores and colons",
                filename: "123/test-key",
                level: "CRITICAL",
                name: "Siri.ServiceDelivery.VehicleMonitoringDelivery.VehicleActivityCancellation.0.LineRef",
                recordedAtTime: "2018-08-17T15:22:20",
                responseTimestamp: "2018-08-17T15:14:21.432",
                timeToExist,
            },
        ];

        await processSqsRecord(
            record as S3EventRecord,
            dbClient as unknown as KyselyDb,
            mockAvlSubscriptionTableName,
            mockAvlValidationErrorsTableName,
            mockGtfsTripMapsTableName,
        );

        expect(valuesMock).toHaveBeenCalledTimes(1);
        expect(valuesMock).toHaveBeenCalledWith([parsedSiri[0]]);
        expect(putDynamoItemsSpy).toHaveBeenCalledWith(mockAvlValidationErrorsTableName, expectedValidationErrors);
    });

    it("uploads validation errors to dynamoDB when processing invalid data", async () => {
        mocks.getS3Object.mockResolvedValueOnce({
            Body: { transformToString: () => testSiriWithInvalidVehicleActivities },
        });

        await processSqsRecord(
            record as S3EventRecord,
            dbClient as unknown as KyselyDb,
            mockAvlSubscriptionTableName,
            mockAvlValidationErrorsTableName,
            mockGtfsTripMapsTableName,
        );

        /**
         * This variable represents a time to live (TTL) in the dynamoDB table
         * in order for dynamoDB to automatically clear entries older than the TTL:
         * https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html
         */
        const timeToExist = getDate().add(3, "days").unix();

        const expectedValidationErrors: AvlValidationError[] = [
            {
                PK: mockSubscriptionId,
                SK: "12a345b6-2be9-49bb-852f-21e5a2400ea6",
                details:
                    "LineRef must be 1-256 characters and only contain letters, numbers, periods, hyphens, underscores and colons",
                filename: record.s3.object.key,
                level: "CRITICAL",
                lineRef: "Invalid$",
                name: "Siri.ServiceDelivery.VehicleMonitoringDelivery.VehicleActivity.0.MonitoredVehicleJourney.LineRef",
                operatorRef: "123",
                recordedAtTime: "2018-08-17T15:22:20",
                responseTimestamp: "2018-08-17T15:14:21.432",
                timeToExist,
                vehicleRef: "200141",
            },
            {
                PK: mockSubscriptionId,
                SK: "12a345b6-2be9-49bb-852f-21e5a2400ea6",
                details: "Required",
                filename: record.s3.object.key,
                level: "NON-CRITICAL",
                lineRef: "Invalid$",
                name: "Siri.ServiceDelivery.VehicleMonitoringDelivery.VehicleActivity.0.MonitoredVehicleJourney.DirectionRef",
                operatorRef: "123",
                recordedAtTime: "2018-08-17T15:22:20",
                responseTimestamp: "2018-08-17T15:14:21.432",
                timeToExist,
                vehicleRef: "200141",
            },
            {
                PK: mockSubscriptionId,
                SK: "12a345b6-2be9-49bb-852f-21e5a2400ea6",
                details: "Required",
                filename: record.s3.object.key,
                level: "CRITICAL",
                lineRef: "Invalid$",
                name: "Siri.ServiceDelivery.VehicleMonitoringDelivery.VehicleActivity.0.MonitoredVehicleJourney.FramedVehicleJourneyRef.DataFrameRef",
                operatorRef: "123",
                recordedAtTime: "2018-08-17T15:22:20",
                responseTimestamp: "2018-08-17T15:14:21.432",
                timeToExist,
                vehicleRef: "200141",
            },
            {
                PK: mockSubscriptionId,
                SK: "12a345b6-2be9-49bb-852f-21e5a2400ea6",
                details:
                    "DestinationName must not contain the following disallowed characters as defined by the XSD: []{}?$%^=@#;:",
                filename: record.s3.object.key,
                level: "NON-CRITICAL",
                lineRef: "Invalid$",
                name: "Siri.ServiceDelivery.VehicleMonitoringDelivery.VehicleActivity.0.MonitoredVehicleJourney.DestinationName",
                operatorRef: "123",
                recordedAtTime: "2018-08-17T15:22:20",
                responseTimestamp: "2018-08-17T15:14:21.432",
                timeToExist,
                vehicleRef: "200141",
            },
            {
                PK: mockSubscriptionId,
                SK: "12a345b6-2be9-49bb-852f-21e5a2400ea6",
                details: "Expected number, received nan",
                filename: record.s3.object.key,
                level: "CRITICAL",
                lineRef: "Invalid$",
                name: "Siri.ServiceDelivery.VehicleMonitoringDelivery.VehicleActivity.0.MonitoredVehicleJourney.VehicleLocation.Longitude",
                operatorRef: "123",
                recordedAtTime: "2018-08-17T15:22:20",
                responseTimestamp: "2018-08-17T15:14:21.432",
                timeToExist,
                vehicleRef: "200141",
            },
            {
                PK: mockSubscriptionId,
                SK: "12a345b6-2be9-49bb-852f-21e5a2400ea6",
                details:
                    "Invalid enum value. Expected 'full' | 'seatsAvailable' | 'standingAvailable', received 'wrong'",
                filename: record.s3.object.key,
                level: "NON-CRITICAL",
                lineRef: "Invalid$",
                name: "Siri.ServiceDelivery.VehicleMonitoringDelivery.VehicleActivity.0.MonitoredVehicleJourney.Occupancy",
                operatorRef: "123",
                recordedAtTime: "2018-08-17T15:22:20",
                responseTimestamp: "2018-08-17T15:14:21.432",
                timeToExist,
                vehicleRef: "200141",
            },
            {
                PK: mockSubscriptionId,
                SK: "12a345b6-2be9-49bb-852f-21e5a2400ea6",
                details: "RecordedAtTime in future",
                filename: record.s3.object.key,
                level: "CRITICAL",
                lineRef: "ATB:Line:60",
                name: "Siri.ServiceDelivery.VehicleMonitoringDelivery.VehicleActivity.1.RecordedAtTime",
                operatorRef: "123",
                recordedAtTime: "2099-08-17T15:13:20",
                responseTimestamp: "2018-08-17T15:14:21.432",
                timeToExist,
                vehicleRef: "200141",
            },
            {
                PK: mockSubscriptionId,
                SK: "12a345b6-2be9-49bb-852f-21e5a2400ea6",
                details:
                    "DatedVehicleJourneyRef must be 1-256 characters and only contain letters, numbers, periods, hyphens, underscores and colons",
                filename: record.s3.object.key,
                level: "CRITICAL",
                lineRef: "ATB:Line:60",
                name: "Siri.ServiceDelivery.VehicleMonitoringDelivery.VehicleActivity.3.MonitoredVehicleJourney.FramedVehicleJourneyRef.DatedVehicleJourneyRef",
                operatorRef: "placeholder",
                recordedAtTime: "2018-08-17T15:13:20",
                responseTimestamp: "2018-08-17T15:14:21.432",
                timeToExist,
                vehicleRef: "200141",
            },
            {
                PK: mockSubscriptionId,
                SK: "12a345b6-2be9-49bb-852f-21e5a2400ea6",
                details: "Required",
                filename: record.s3.object.key,
                level: "CRITICAL",
                name: "Siri.ServiceDelivery.ProducerRef",
                responseTimestamp: "2018-08-17T15:14:21.432",
                timeToExist,
            },
        ];
        expect(putDynamoItemsSpy).toHaveBeenCalledWith(mockAvlValidationErrorsTableName, expectedValidationErrors);
        expect(valuesMock).not.toHaveBeenCalled();
    });

    it("should throw an error when the subscription is not active", async () => {
        const avlSubscription: AvlSubscription = {
            PK: "411e4495-4a57-4d2f-89d5-cf105441f321",
            url: "https://mock-data-producer.com/",
            description: "test-description",
            shortDescription: "test-short-description",
            status: "inactive",
            requestorRef: null,
            publisherId: "test-publisher-id",
            apiKey: "mock-api-key",
        };

        getDynamoItemSpy.mockResolvedValue(avlSubscription);

        await expect(
            processSqsRecord(
                record as S3EventRecord,
                dbClient as unknown as KyselyDb,
                mockAvlSubscriptionTableName,
                mockAvlValidationErrorsTableName,
                mockGtfsTripMapsTableName,
            ),
        ).rejects.toThrowError(`Unable to process AVL for subscription ${mockSubscriptionId} because it is inactive`);

        expect(valuesMock).not.toHaveBeenCalled();

        expect(putMetricDataSpy).not.toHaveBeenCalledOnce();
    });
});
