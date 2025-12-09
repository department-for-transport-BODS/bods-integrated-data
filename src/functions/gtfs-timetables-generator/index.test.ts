import { mockCallback, mockContext, mockEvent } from "@bods-integrated-data/shared/mockHandlerArgs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    createGtfsZip,
    englandTripTableHandler,
    exportHandler,
    ignoreEmptyFiles,
    tripTableHandler,
    zipHandler,
} from ".";
import { Files, GtfsFile } from "./data";

describe("gtfs-timetables-generator", () => {
    const mocks = vi.hoisted(() => {
        return {
            listS3Objects: vi.fn(),
            getS3Object: vi.fn(),
            startS3Upload: vi.fn(),
            createLazyDownloadStreamFrom: vi.fn(),
            appendMock: vi.fn(),
            abortMock: vi.fn(),
            getQueryMock: vi.fn(),
        };
    });

    vi.mock("@bods-integrated-data/shared/database", () => ({
        getDatabaseClient: vi.fn(),
    }));

    vi.mock("@bods-integrated-data/shared/s3", () => ({
        listS3Objects: mocks.listS3Objects.mockResolvedValue({
            Contents: [
                {
                    Size: 1000,
                    Key: "test",
                },
            ],
        }),
        getS3Object: mocks.getS3Object.mockResolvedValue({
            Body: {
                transformToString: () => Promise.resolve(""),
            },
        }),
        createLazyDownloadStreamFrom: mocks.createLazyDownloadStreamFrom.mockReturnValue("stream"),
        startS3Upload: mocks.startS3Upload.mockReturnValue({
            done: () => Promise.resolve(),
        }),
    }));

    afterEach(() => {
        mocks.getS3Object.mockClear();
    });

    describe("ignoreEmptyFiles", () => {
        it("returns same files if no empty files are present", async () => {
            const files: GtfsFile[] = [
                {
                    fileName: Files.AGENCY,
                    include: true,
                },
            ];

            const newFiles = await ignoreEmptyFiles("bucket", "filePath", files);

            expect(mocks.getS3Object).not.toBeCalled();
            expect(newFiles[0].include).toBeTruthy();
        });

        it("returns same files if there is a small file which isn't empty", async () => {
            mocks.listS3Objects.mockResolvedValue({
                Contents: [
                    {
                        Size: 100,
                        Key: "test",
                    },
                ],
            });

            mocks.getS3Object.mockResolvedValue({
                Body: {
                    transformToString: () => Promise.resolve("a,b,c\n1,2,3"),
                },
            });

            const files: GtfsFile[] = [
                {
                    fileName: Files.AGENCY,
                    include: true,
                },
            ];

            const newFiles = await ignoreEmptyFiles("bucket", "filePath", files);

            expect(mocks.getS3Object).toBeCalledTimes(1);
            expect(newFiles[0].include).toBeTruthy();
        });

        it("disables files if there is an empty file", async () => {
            mocks.listS3Objects.mockResolvedValue({
                Contents: [
                    {
                        Size: 100,
                        Key: Files.ROUTES,
                    },
                ],
            });

            mocks.getS3Object.mockResolvedValue({
                Body: {
                    transformToString: () => Promise.resolve("a,b,c\n"),
                },
            });

            const files: GtfsFile[] = [
                {
                    fileName: Files.ROUTES,
                    include: true,
                },
            ];

            const newFiles = await ignoreEmptyFiles("bucket", "filePath", files);

            expect(mocks.getS3Object).toBeCalledTimes(1);
            expect(newFiles[0].include).toBeFalsy();
        });
    });

    describe("createGtfsZip", () => {
        vi.mock("archiver", () => ({
            default: vi.fn().mockImplementation(() => ({
                append: mocks.appendMock,
                finalize: vi.fn(),
                abort: mocks.abortMock,
                pipe: vi.fn(),
            })),
        }));

        afterEach(() => {
            mocks.appendMock.mockClear();
        });

        it("appends files when include is true", async () => {
            const files: GtfsFile[] = [
                {
                    fileName: Files.CALENDAR,
                    include: true,
                },
                {
                    fileName: Files.SHAPES,
                    include: true,
                },
            ];

            await createGtfsZip("gtfsBucket", "outputBucket", "filePath", files);

            expect(mocks.appendMock).toBeCalledTimes(2);
            expect(mocks.appendMock).toBeCalledWith("stream", { name: "calendar.txt" });
            expect(mocks.appendMock).toBeCalledWith("stream", { name: "shapes.txt" });
        });

        it("ignores files when include is false", async () => {
            const files: GtfsFile[] = [
                {
                    fileName: Files.FREQUENCIES,
                    include: false,
                },
                {
                    fileName: Files.AGENCY,
                    include: true,
                },
            ];

            await createGtfsZip("gtfsBucket", "outputBucket", "filePath", files);

            expect(mocks.appendMock).toBeCalledTimes(1);
            expect(mocks.appendMock).toBeCalledWith("stream", { name: "agency.txt" });
        });
    });

    describe("handler", () => {
        const handlerMocks = vi.hoisted(() => {
            return {
                createRegionalTripTable: vi.fn(),
                createTripTable: vi.fn(),
                createEnglandTripTable: vi.fn(),
                queryBuilder: vi.fn().mockReturnValue([
                    {
                        fileName: "calendar",
                        include: true,
                        getQuery: mocks.getQueryMock,
                    },
                ]),
                exportDataToS3: vi.fn(),
                dropRegionalTripTable: vi.fn(),
                databaseClient: {
                    destroy: vi.fn(),
                },
            };
        });

        vi.mock("@bods-integrated-data/shared/database", () => ({
            getDatabaseClient: () => handlerMocks.databaseClient,
        }));

        vi.mock("./data", async (importOriginal) => ({
            ...(await importOriginal<typeof import("./data")>()),
            createRegionalTripTable: handlerMocks.createRegionalTripTable,
            createTripTable: handlerMocks.createTripTable,
            createEnglandTripTable: handlerMocks.createEnglandTripTable,
            queryBuilder: handlerMocks.queryBuilder,
            exportDataToS3: handlerMocks.exportDataToS3,
            dropRegionalTripTable: handlerMocks.dropRegionalTripTable,
        }));

        beforeEach(() => {
            process.env.OUTPUT_BUCKET = "outputBucket";
            process.env.GTFS_BUCKET = "gtfsBucket";

            handlerMocks.exportDataToS3.mockClear();
            mocks.startS3Upload.mockClear();
            handlerMocks.createTripTable.mockClear();
        });

        describe("national GTFS", () => {
            it("exports national data to s3 when no region code passed", async () => {
                await exportHandler(mockEvent, mockContext, mockCallback);

                expect(handlerMocks.exportDataToS3).toBeCalledTimes(1);
                expect(handlerMocks.exportDataToS3).toBeCalledWith(
                    [{ fileName: "calendar", getQuery: mocks.getQueryMock, include: true }],
                    "outputBucket",
                    handlerMocks.databaseClient,
                    "all_gtfs",
                );
            });

            it("doesn't create regional trip table for national file", async () => {
                await tripTableHandler(mockEvent, mockContext, mockCallback);

                expect(handlerMocks.createTripTable).toBeCalled();
                expect(handlerMocks.dropRegionalTripTable).not.toBeCalled();
                expect(handlerMocks.createRegionalTripTable).not.toBeCalled();
            });

            it("creates GTFS zip", async () => {
                await zipHandler(mockEvent, mockContext, mockCallback);

                expect(mocks.startS3Upload).toBeCalledTimes(1);
                expect(mocks.startS3Upload).toBeCalledWith(
                    "gtfsBucket",
                    "all_gtfs.zip",
                    expect.anything(),
                    "application/zip",
                );
            });
        });

        describe("regional GTFS", () => {
            it("exports regional data to s3 when region code passed", async () => {
                await exportHandler({ regionCode: "Y" }, mockContext, mockCallback);

                expect(handlerMocks.exportDataToS3).toBeCalledTimes(1);
                expect(handlerMocks.exportDataToS3).toBeCalledWith(
                    [{ fileName: "calendar", getQuery: mocks.getQueryMock, include: true }],
                    "outputBucket",
                    handlerMocks.databaseClient,
                    "y_gtfs",
                );
            });

            it("creates regional trip table", async () => {
                await tripTableHandler({ regionCode: "Y" }, mockContext, mockCallback);

                expect(handlerMocks.createTripTable).not.toBeCalled();
                expect(handlerMocks.dropRegionalTripTable).toBeCalledWith(handlerMocks.databaseClient, "Y");
                expect(handlerMocks.createRegionalTripTable).toBeCalledWith(handlerMocks.databaseClient, "Y");
            });

            it("creates england trip table", async () => {
                await englandTripTableHandler({}, mockContext, mockCallback);

                expect(handlerMocks.createTripTable).not.toBeCalled();
                expect(handlerMocks.dropRegionalTripTable).toBeCalledWith(handlerMocks.databaseClient, "E");
                expect(handlerMocks.createEnglandTripTable).toBeCalledWith(handlerMocks.databaseClient);
            });

            it("creates GTFS zip", async () => {
                await zipHandler({ regionCode: "Y" }, mockContext, mockCallback);

                expect(mocks.startS3Upload).toBeCalledTimes(1);
                expect(mocks.startS3Upload).toBeCalledWith(
                    "gtfsBucket",
                    "y_gtfs.zip",
                    expect.anything(),
                    "application/zip",
                );
            });
        });
    });
});
