import { gzipSync } from "node:zlib";
import * as dynamo from "@bods-integrated-data/shared/dynamo";
import { logger } from "@bods-integrated-data/shared/logger";
import { mockCallback, mockContext } from "@bods-integrated-data/shared/mockHandlerArgs";
import * as s3 from "@bods-integrated-data/shared/s3";
import { AvlSubscription } from "@bods-integrated-data/shared/schema/avl-subscribe.schema";
import { ALBEvent, APIGatewayProxyEvent } from "aws-lambda";
import MockDate from "mockdate";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from ".";
import {
    mockEmptySiri,
    mockHeartbeatNotification,
    testCancellationsSiri,
    testSiriVm,
    testSiriVmWithSingleVehicleActivity,
    testSiriWithEmptyVehicleActivity,
    testSiriWithNoVehicleActivity,
    testSiriWithSelfClosingVehicleActivity,
    testVehicleActivityAndCancellationsSiri,
} from "./testSiriVm";

describe("AVL-data-endpoint", () => {
    vi.mock("@bods-integrated-data/shared/logger", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@bods-integrated-data/shared/logger")>()),
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    }));

    const mocks = vi.hoisted(() => {
        return {
            startS3Upload: vi.fn(),
        };
    });

    vi.mock("@bods-integrated-data/shared/s3", () => ({
        startS3Upload: mocks.startS3Upload.mockReturnValue({
            done: () => Promise.resolve(),
        }),
    }));

    vi.mock("@bods-integrated-data/shared/dynamo", () => ({
        putDynamoItem: vi.fn(),
        getDynamoItem: vi.fn(),
    }));

    const getDynamoItemSpy = vi.spyOn(dynamo, "getDynamoItem");

    MockDate.set("2024-03-11T15:20:02.093Z");
    const mockSubscriptionId = "411e4495-4a57-4d2f-89d5-cf105441f321";
    let mockEvent: APIGatewayProxyEvent;

    beforeEach(() => {
        process.env.BUCKET_NAME = "test-bucket";
        process.env.TABLE_NAME = "test-dynamodb";

        vi.clearAllMocks();

        mockEvent = {
            queryStringParameters: {
                apiKey: "mock-api-key",
            },
            pathParameters: {
                subscriptionId: mockSubscriptionId,
            },
            body: testSiriVm,
        } as unknown as APIGatewayProxyEvent;

        getDynamoItemSpy.mockResolvedValue({
            PK: "411e4495-4a57-4d2f-89d5-cf105441f321",
            url: "https://mock-data-producer.com/",
            description: "test-description",
            shortDescription: "test-short-description",
            status: "live",
            requestorRef: null,
            publisherId: "test-publisher-id",
            apiKey: "mock-api-key",
        });
    });

    afterAll(() => {
        MockDate.reset();
    });

    it.each(["live", "error"] as const)(
        "Should add valid AVL data to S3 if subscription status is %o",
        async (status) => {
            const avlSubscription: AvlSubscription = {
                PK: "411e4495-4a57-4d2f-89d5-cf105441f321",
                description: "test-description",
                lastAvlDataReceivedDateTime: "2024-03-11T15:20:02.093Z",
                requestorRef: null,
                shortDescription: "test-short-description",
                status,
                url: "https://mock-data-producer.com/",
                publisherId: "test-publisher-id",
                apiKey: "mock-api-key",
            };

            getDynamoItemSpy.mockResolvedValue(avlSubscription);

            await expect(handler(mockEvent, mockContext, mockCallback)).resolves.toEqual({ statusCode: 200, body: "" });

            expect(s3.startS3Upload).toHaveBeenCalled();
            expect(s3.startS3Upload).toHaveBeenCalledWith(
                "test-bucket",
                `${mockSubscriptionId}/2024-03-11T15:20:02.093Z.xml`,
                `${testSiriVm}`,
                "application/xml",
            );

            expect(dynamo.putDynamoItem).toHaveBeenCalledWith<Parameters<typeof dynamo.putDynamoItem>>(
                "test-dynamodb",
                avlSubscription.PK,
                "SUBSCRIPTION",
                avlSubscription,
            );
        },
    );

    it("Should add valid AVL data with a single vehicle activity to S3", async () => {
        const subscription: AvlSubscription = {
            PK: "411e4495-4a57-4d2f-89d5-cf105441f321",
            url: "https://mock-data-producer.com/",
            description: "test-description",
            shortDescription: "test-short-description",
            lastAvlDataReceivedDateTime: "2024-03-11T00:00:00.000Z",
            status: "live",
            requestorRef: null,
            publisherId: "test-publisher-id",
            apiKey: "mock-api-key",
        };
        getDynamoItemSpy.mockResolvedValue(subscription);
        mockEvent.body = testSiriVmWithSingleVehicleActivity;

        await expect(handler(mockEvent, mockContext, mockCallback)).resolves.toEqual({ statusCode: 200, body: "" });
        expect(s3.startS3Upload).toHaveBeenCalled();
        expect(s3.startS3Upload).toHaveBeenCalledWith(
            "test-bucket",
            `${mockSubscriptionId}/2024-03-11T15:20:02.093Z.xml`,
            `${testSiriVmWithSingleVehicleActivity}`,
            "application/xml",
        );

        expect(dynamo.putDynamoItem).toHaveBeenCalledWith<Parameters<typeof dynamo.putDynamoItem>>(
            "test-dynamodb",
            subscription.PK,
            "SUBSCRIPTION",
            { ...subscription, lastAvlDataReceivedDateTime: "2024-03-11T15:20:02.093Z" },
        );
    });

    it("Throws an error when the required env vars are missing", async () => {
        process.env.BUCKET_NAME = "";
        process.env.TABLE_NAME = "";
        mockEvent.body = testSiriVmWithSingleVehicleActivity;

        await expect(handler(mockEvent, mockContext, mockCallback)).rejects.toThrow("An unexpected error occurred");

        expect(logger.error).toHaveBeenCalledWith(expect.any(Error), "There was a problem with the Data endpoint");
        expect(s3.startS3Upload).not.toHaveBeenCalled();
    });

    it.each([
        [undefined, "subscriptionId is required"],
        ["", "subscriptionId must be 1-256 characters"],
        ["1".repeat(257), "subscriptionId must be 1-256 characters"],
    ])(
        "Throws an error when the subscription ID fails validation (test: %o)",
        async (subscriptionId, expectedErrorMessage) => {
            mockEvent.pathParameters = {
                subscriptionId,
            };

            const response = await handler(mockEvent, mockContext, mockCallback);
            expect(response).toEqual({
                statusCode: 400,
                body: JSON.stringify({ errors: [expectedErrorMessage] }),
            });
            expect(logger.warn).toHaveBeenCalledWith(expect.any(Error), "Invalid request");
            expect(s3.startS3Upload).not.toHaveBeenCalled();
        },
    );

    it.each([[null, "Body must be a string"]])(
        "Throws an error when the body fails validation (test %#)",
        async (body, expectedErrorMessage) => {
            mockEvent.body = body;

            const response = await handler(mockEvent, mockContext, mockCallback);
            expect(response).toEqual({ statusCode: 400, body: JSON.stringify({ errors: [expectedErrorMessage] }) });
            expect(logger.warn).toHaveBeenCalledWith(expect.any(Error), "Invalid request");
            expect(s3.startS3Upload).not.toHaveBeenCalled();
        },
    );

    it.each(["abc", mockEmptySiri])("Does not throw an error when invalid XML is provided", async (input) => {
        mockEvent.body = input;

        const response = await handler(mockEvent, mockContext, mockCallback);
        expect(response).toEqual({
            statusCode: 200,
            body: "",
        });
        expect(logger.warn).not.toHaveBeenCalledWith("Invalid XML provided", expect.anything());
        expect(s3.startS3Upload).toHaveBeenCalled();
    });

    it("Throws an error when the subscription is inactive", async () => {
        getDynamoItemSpy.mockResolvedValue({
            PK: "411e4495-4a57-4d2f-89d5-cf105441f321",
            url: "https://mock-data-producer.com/",
            description: "test-description",
            shortDescription: "test-short-description",
            status: "inactive",
            requestorRef: null,
            publisherId: "test-publisher-id",
            apiKey: "mock-api-key",
        });

        const response = await handler(mockEvent, mockContext, mockCallback);
        expect(response).toEqual({
            statusCode: 404,
            body: JSON.stringify({ errors: ["Subscription is inactive"] }),
        });
        expect(dynamo.putDynamoItem).not.toHaveBeenCalled();
    });

    it("should process a valid heartbeat notification and update dynamodb with heartbeat details", async () => {
        mockEvent.body = mockHeartbeatNotification;

        const expectedSubscription: AvlSubscription = {
            PK: "411e4495-4a57-4d2f-89d5-cf105441f321",
            description: "test-description",
            heartbeatLastReceivedDateTime: "2024-03-11T15:20:02.093Z",
            requestorRef: null,
            shortDescription: "test-short-description",
            status: "live",
            url: "https://mock-data-producer.com/",
            publisherId: "test-publisher-id",
            apiKey: "mock-api-key",
        };

        await expect(handler(mockEvent, mockContext, mockCallback)).resolves.toEqual({ statusCode: 200, body: "" });
        expect(dynamo.putDynamoItem).toHaveBeenCalledWith<Parameters<typeof dynamo.putDynamoItem>>(
            "test-dynamodb",
            expectedSubscription.PK,
            "SUBSCRIPTION",
            expectedSubscription,
        );
    });

    it("Throws an error if when processing a heartbeat notification the subscription does not exist in dynamodb", async () => {
        getDynamoItemSpy.mockResolvedValue(null);
        mockEvent.body = mockHeartbeatNotification;

        const response = await handler(mockEvent, mockContext, mockCallback);
        expect(response).toEqual({
            statusCode: 404,
            body: JSON.stringify({ errors: ["Subscription not found"] }),
        });
        expect(dynamo.putDynamoItem).not.toHaveBeenCalled();
    });

    it.each([[undefined], ["invalid-key"]])("returns a 401 when an invalid api key is supplied", async (key) => {
        mockEvent.queryStringParameters = {
            apiKey: key,
        };

        const response = await handler(mockEvent, mockContext, mockCallback);
        expect(response).toEqual({
            statusCode: 401,
            body: JSON.stringify({ errors: ["Unauthorized"] }),
        });
    });

    it("handles an ALB event with a path", async () => {
        getDynamoItemSpy.mockResolvedValue({
            PK: "411e4495-4a57-4d2f-89d5-cf105441f321",
            url: "https://mock-data-producer.com/",
            description: "test-description",
            shortDescription: "test-short-description",
            status: "live",
            requestorRef: null,
            publisherId: "test-publisher-id",
            apiKey: "mock-api-key",
        });

        const mockAlbEvent = {
            path: `/${mockSubscriptionId}`,
            body: testSiriVm,
        } as unknown as ALBEvent;

        const expectedSubscription: AvlSubscription = {
            PK: "411e4495-4a57-4d2f-89d5-cf105441f321",
            description: "test-description",
            lastAvlDataReceivedDateTime: "2024-03-11T15:20:02.093Z",
            requestorRef: null,
            shortDescription: "test-short-description",
            status: "live",
            url: "https://mock-data-producer.com/",
            publisherId: "test-publisher-id",
            apiKey: "mock-api-key",
        };

        await expect(handler(mockAlbEvent, mockContext, mockCallback)).resolves.toEqual({ statusCode: 200, body: "" });

        expect(getDynamoItemSpy).toHaveBeenCalledWith("test-dynamodb", {
            PK: mockSubscriptionId,
            SK: "SUBSCRIPTION",
        });

        expect(s3.startS3Upload).toHaveBeenCalled();
        expect(s3.startS3Upload).toHaveBeenCalledWith(
            "test-bucket",
            `${mockSubscriptionId}/2024-03-11T15:20:02.093Z.xml`,
            `${testSiriVm}`,
            "application/xml",
        );

        expect(dynamo.putDynamoItem).toHaveBeenCalledWith<Parameters<typeof dynamo.putDynamoItem>>(
            "test-dynamodb",
            expectedSubscription.PK,
            "SUBSCRIPTION",
            expectedSubscription,
        );
    });

    it("returns 200 for the healthcheck endpoint", async () => {
        const mockAlbEvent = {
            path: "/health",
        } as unknown as ALBEvent;

        const response = await handler(mockAlbEvent, mockContext, mockCallback);
        expect(response).toEqual({
            statusCode: 200,
            body: "",
        });

        expect(s3.startS3Upload).not.toHaveBeenCalledOnce();
        expect(dynamo.putDynamoItem).not.toHaveBeenCalledOnce();
    });

    it("should return a 200 and add data to S3 if vehicle activity and cancellations received", async () => {
        mockEvent.body = testVehicleActivityAndCancellationsSiri;
        await expect(handler(mockEvent, mockContext, mockCallback)).resolves.toEqual({ statusCode: 200, body: "" });

        expect(s3.startS3Upload).toHaveBeenCalledOnce();
        expect(dynamo.putDynamoItem).toHaveBeenCalledOnce();
    });

    it("should return a 200 and add data to S3 if only cancellations data is received", async () => {
        mockEvent.body = testCancellationsSiri;
        await expect(handler(mockEvent, mockContext, mockCallback)).resolves.toEqual({ statusCode: 200, body: "" });

        expect(s3.startS3Upload).toHaveBeenCalledOnce();
        expect(s3.startS3Upload).toHaveBeenCalledWith(
            "test-bucket",
            `${mockSubscriptionId}/2024-03-11T15:20:02.093Z.xml`,
            `${testCancellationsSiri}`,
            "application/xml",
        );
        expect(dynamo.putDynamoItem).toHaveBeenCalledOnce();
    });

    it.each([testSiriWithNoVehicleActivity, testSiriWithSelfClosingVehicleActivity, testSiriWithEmptyVehicleActivity])(
        "should return a 200 but not add data to S3 if location data with no vehicle activities is received",
        async (input) => {
            mockEvent.body = input;
            await expect(handler(mockEvent, mockContext, mockCallback)).resolves.toEqual({ statusCode: 200, body: "" });

            expect(s3.startS3Upload).not.toHaveBeenCalledOnce();
            expect(dynamo.putDynamoItem).not.toHaveBeenCalledOnce();
        },
    );

    it("Should add valid AVL data that is provided as a gzip to S3", async () => {
        const subscription: AvlSubscription = {
            PK: "411e4495-4a57-4d2f-89d5-cf105441f321",
            url: "https://mock-data-producer.com/",
            description: "test-description",
            shortDescription: "test-short-description",
            lastAvlDataReceivedDateTime: "2024-03-11T00:00:00.000Z",
            status: "live",
            requestorRef: null,
            publisherId: "test-publisher-id",
            apiKey: "mock-api-key",
        };
        getDynamoItemSpy.mockResolvedValue(subscription);
        mockEvent.body = gzipSync(testSiriVmWithSingleVehicleActivity).toString("base64");
        mockEvent.headers = {
            "Content-Encoding": "gzip",
        };

        await expect(handler(mockEvent, mockContext, mockCallback)).resolves.toEqual({ statusCode: 200, body: "" });
        expect(s3.startS3Upload).toHaveBeenCalled();
        expect(s3.startS3Upload).toHaveBeenCalledWith(
            "test-bucket",
            `${mockSubscriptionId}/2024-03-11T15:20:02.093Z.xml`,
            `${testSiriVmWithSingleVehicleActivity}`,
            "application/xml",
        );

        expect(dynamo.putDynamoItem).toHaveBeenCalledWith<Parameters<typeof dynamo.putDynamoItem>>(
            "test-dynamodb",
            subscription.PK,
            "SUBSCRIPTION",
            { ...subscription, lastAvlDataReceivedDateTime: "2024-03-11T15:20:02.093Z" },
        );
    });
});
