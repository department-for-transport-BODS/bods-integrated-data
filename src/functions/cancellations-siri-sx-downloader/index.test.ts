import * as utilFunctions from "@bods-integrated-data/shared/cancellations/utils";
import { GENERATED_SIRI_SX_FILE_PATH } from "@bods-integrated-data/shared/cancellations/utils";
import { logger } from "@bods-integrated-data/shared/logger";
import { mockCallback, mockContext } from "@bods-integrated-data/shared/mockHandlerArgs";
import * as secretsManagerFunctions from "@bods-integrated-data/shared/secretsManager";
import { APIGatewayEvent, APIGatewayProxyEvent } from "aws-lambda";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from ".";

describe("cancellations-siri-sx-downloader-endpoint", () => {
    const mocks = vi.hoisted(() => {
        return {
            getS3Object: vi.fn(),
            execute: vi.fn(),
            destroy: vi.fn(),
            mockDbClient: {
                destroy: vi.fn(),
            },
        };
    });

    vi.mock("@bods-integrated-data/shared/s3", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@bods-integrated-data/shared/s3")>()),
        getS3Object: mocks.getS3Object,
    }));

    vi.mock("@bods-integrated-data/shared/cloudwatch");

    vi.mock("@bods-integrated-data/shared/database", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@bods-integrated-data/shared/database")>()),
        getDatabaseClient: vi.fn().mockReturnValue(mocks.mockDbClient),
    }));

    vi.mock("@bods-integrated-data/shared/avl/utils");

    const getSituationsDataForSiriSxMock = vi.spyOn(utilFunctions, "getSituationsDataForSiriSx");
    const createSiriSxMock = vi.spyOn(utilFunctions, "createSiriSx");
    vi.spyOn(secretsManagerFunctions, "getSecret");

    const mockBucketName = "mock-bucket";
    const mockRequest: APIGatewayEvent = {} as APIGatewayProxyEvent;

    vi.mock("@bods-integrated-data/shared/logger", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@bods-integrated-data/shared/logger")>()),
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    }));

    beforeEach(() => {
        process.env.BUCKET_NAME = mockBucketName;
    });

    afterEach(() => {
        vi.clearAllMocks();
        getSituationsDataForSiriSxMock.mockReset();
        createSiriSxMock.mockReset();
    });

    it("returns a 500 when the BUCKET_NAME environment variable is missing", async () => {
        process.env.BUCKET_NAME = "";

        await expect(handler(mockRequest, mockContext, mockCallback)).rejects.toThrow("An unexpected error occurred");
    });

    describe("fetching SIRI-SX in-place", () => {
        it("returns a 200 with SIRI-SX in-place", async () => {
            mocks.getS3Object.mockResolvedValueOnce("siri");

            await expect(handler(mockRequest, mockContext, mockCallback)).resolves.toEqual({
                statusCode: 200,
                headers: {
                    "Content-Encoding": "gzip",
                    "Content-Type": "application/xml",
                },
                isBase64Encoded: true,
                body: expect.any(String),
            });

            expect(mocks.getS3Object).toHaveBeenCalledWith({
                Bucket: mockBucketName,
                Key: GENERATED_SIRI_SX_FILE_PATH,
                ResponseContentType: "application/xml",
            });
            expect(logger.error).not.toHaveBeenCalled();
        });

        it("returns a 500 when an unexpected error occurs", async () => {
            mocks.getS3Object.mockRejectedValueOnce(new Error());

            await expect(handler(mockRequest, mockContext, mockCallback)).rejects.toThrow(
                "An unexpected error occurred",
            );
        });
    });

    describe("filter SIRI-SX", () => {
        describe("valid requests", () => {
            it("returns a 200 with filtered data when the subscriptionId query param is used", async () => {
                getSituationsDataForSiriSxMock.mockResolvedValueOnce([]);
                createSiriSxMock.mockReturnValueOnce("siri-output");

                mockRequest.queryStringParameters = {
                    subscriptionId: "1,2,3",
                };

                await expect(handler(mockRequest, mockContext, mockCallback)).resolves.toEqual({
                    statusCode: 200,
                    headers: { "Content-Type": "application/xml", "Content-Encoding": "gzip" },
                    isBase64Encoded: true,
                    body: expect.any(String),
                });

                expect(getSituationsDataForSiriSxMock).toHaveBeenCalledWith(mocks.mockDbClient, ["1", "2", "3"]);
                expect(logger.error).not.toHaveBeenCalled();
            });
        });

        describe("invalid requests", () => {
            it("returns a 400 when the subscriptionId query param fails validation", async () => {
                mockRequest.queryStringParameters = {
                    subscriptionId: 1,
                } as unknown as (typeof mockRequest)["queryStringParameters"];

                const response = await handler(mockRequest, mockContext, mockCallback);
                expect(response).toEqual({
                    statusCode: 400,
                    body: JSON.stringify({ errors: ["subscriptionId must be a string"] }),
                });
                expect(getSituationsDataForSiriSxMock).not.toHaveBeenCalled();
            });

            it("returns a 500 when an unexpected error occurs", async () => {
                getSituationsDataForSiriSxMock.mockRejectedValueOnce(new Error("Database fetch error"));

                mockRequest.queryStringParameters = {
                    subscriptionId: "1",
                };

                await expect(handler(mockRequest, mockContext, mockCallback)).rejects.toThrow(
                    "An unexpected error occurred",
                );
            });
        });
    });
});
