import { S3Client } from "@aws-sdk/client-s3";
import { logger } from "@bods-integrated-data/shared/logger";
import { mockCallback, mockContext, mockEvent } from "@bods-integrated-data/shared/mockHandlerArgs";
import { listS3Objects } from "@bods-integrated-data/shared/s3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TflTimetableRetrieverOutput, handler } from ".";

describe("tfl-timetable-retriever", () => {
    const mockBucketName = "mock-bucket";

    const mocks = vi.hoisted(() => {
        return {
            listS3Objects: vi.fn(),
            putS3Object: vi.fn(),
        };
    });

    vi.mock("@bods-integrated-data/shared/logger", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@bods-integrated-data/shared/logger")>()),
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    }));

    vi.mock("@bods-integrated-data/shared/s3", () => ({
        listS3Objects: mocks.listS3Objects,
        putS3Object: mocks.putS3Object,
    }));

    vi.mock("@aws-sdk/client-s3");

    vi.mock("./database");
    vi.mock("@bods-integrated-data/shared/database");

    const mockBaseVersionXml = `
<?xml version="1.0" encoding="UTF-8"?>
<bv:Versioning_Of_Data xmlns:bv="http://www.tfl.uk/CDII/Base_Version" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.tfl.uk/CDII/Base_Version ../Schema/Base_Version.xsd">
	<Base_Version>20250426</Base_Version>
	<Valid_From>2025-04-25T00:00:00</Valid_From>
	<Valid_To>2025-05-21T00:00:00</Valid_To>
</bv:Versioning_Of_Data>`;

    beforeEach(() => {
        process.env.TFL_TIMETABLE_ZIPPED_BUCKET_NAME = mockBucketName;
        vi.resetAllMocks();
    });

    it("throws an error when the TFL_TIMETABLE_ZIPPED_BUCKET_NAME environment variable is missing", async () => {
        process.env.TFL_TIMETABLE_ZIPPED_BUCKET_NAME = "";

        await expect(handler(mockEvent, mockContext, mockCallback)).rejects.toThrow(
            "Missing env vars - TFL_TIMETABLE_ZIPPED_BUCKET_NAME must be set",
        );

        expect(logger.error).toHaveBeenCalledWith(
            expect.any(Error),
            "There was a problem with the TfL timetable retriever function",
        );
    });

    it("throws an error when the base version data cannot be retrieved", async () => {
        // @ts-ignore mock S3Client
        vi.mocked(S3Client.prototype.send).mockResolvedValueOnce({
            Body: null,
        });

        await expect(handler(mockEvent, mockContext, mockCallback)).rejects.toThrow("No base version xml data");
        expect(logger.error).toHaveBeenCalledWith(
            expect.any(Error),
            "There was a problem with the TfL timetable retriever function",
        );
    });

    it("throws and error when the base version data is invalid", async () => {
        // @ts-ignore mock S3Client
        vi.mocked(S3Client.prototype.send).mockResolvedValueOnce({
            Body: {
                transformToString: () => Promise.resolve("asdf"),
            },
        });

        await expect(handler(mockEvent, mockContext, mockCallback)).rejects.toThrow(
            'Validation error: Required at "bv:Versioning_Of_Data"',
        );
        expect(logger.error).toHaveBeenCalledWith(
            expect.any(Error),
            "There was a problem with the TfL timetable retriever function",
        );
    });

    it("logs a warning and skips retrieval when the prefix already exists", async () => {
        // @ts-ignore mock S3Client
        vi.mocked(S3Client.prototype.send).mockResolvedValueOnce({
            Body: {
                transformToString: () => Promise.resolve(mockBaseVersionXml),
            },
        });

        // @ts-ignore mock S3Client
        vi.mocked(S3Client.prototype.send).mockResolvedValueOnce({
            CommonPrefixes: [{ Prefix: "Base_Version_20250426/" }],
        });

        // @ts-ignore mock listS3Objects
        vi.mocked(listS3Objects).mockResolvedValueOnce({
            CommonPrefixes: [{ Prefix: "Base_Version_20250426/" }],
        });

        const response = await handler(mockEvent, mockContext, mockCallback);

        expect(logger.warn).toHaveBeenCalledWith('Prefix "Base_Version_20250426/" already exists, skipping retrieval');

        const expectedOutput: TflTimetableRetrieverOutput = {
            tflTimetableZippedBucketName: mockBucketName,
            prefix: "Base_Version_20250426/",
        };

        expect(response).toEqual(expectedOutput);
    });

    it("retrieves files from the S3 bucket", async () => {
        const mockBody = [1, 2, 3];

        // @ts-ignore mock S3Client
        vi.mocked(S3Client.prototype.send).mockResolvedValueOnce({
            Body: {
                transformToString: () => Promise.resolve(mockBaseVersionXml),
            },
        });

        // @ts-ignore mock S3Client
        vi.mocked(S3Client.prototype.send).mockResolvedValueOnce({
            CommonPrefixes: [{ Prefix: "Base_Version_20250426/" }],
            Contents: [
                { Key: "Base_Version_20250426/UN/" },
                { Key: "file1.zip" },
                { Key: "Base_Version_20250426/notes.txt" },
                { Key: "file2.zip" },
            ],
        });

        // @ts-ignore mock S3Client
        vi.mocked(S3Client.prototype.send).mockResolvedValue({
            Body: { transformToByteArray: () => Promise.resolve(mockBody) },
        });

        // @ts-ignore mock listS3Objects
        vi.mocked(listS3Objects).mockResolvedValueOnce({
            CommonPrefixes: [{ Prefix: "Base_Version_20250419/" }],
        });

        const response = await handler(mockEvent, mockContext, mockCallback);

        expect(logger.info).toHaveBeenCalledWith('Selected base version: "Base_Version_20250426/"');
        expect(logger.info).toHaveBeenCalledWith("Retrieving 2 files");
        expect(mocks.putS3Object).toHaveBeenCalledTimes(2);
        expect(mocks.putS3Object).toHaveBeenCalledWith({
            Bucket: mockBucketName,
            Key: "file1.zip",
            Body: mockBody,
        });
        expect(mocks.putS3Object).toHaveBeenCalledWith({
            Bucket: mockBucketName,
            Key: "file2.zip",
            Body: mockBody,
        });

        const expectedOutput: TflTimetableRetrieverOutput = {
            tflTimetableZippedBucketName: mockBucketName,
            prefix: "Base_Version_20250426/",
        };

        expect(response).toEqual(expectedOutput);
    });
});
