import { PassThrough, Readable } from "node:stream";
import {
    GetObjectCommand,
    GetObjectCommandInput,
    ListObjectsV2Command,
    ListObjectsV2CommandInput,
    ListObjectsV2CommandOutput,
    PutObjectCommand,
    PutObjectCommandInput,
    S3Client,
    _Object,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "./logger";

const replaceSpecialCharacters = (input: string) => input.replace(/[^a-zA-Z0-9._!\*\'\(\)\/-]/g, "_");
const localStackHost = process.env.LOCALSTACK_HOSTNAME;
const isDocker = process.env.IS_DOCKER;

const client = new S3Client({
    region: "eu-west-2",
    ...(process.env.STAGE === "local"
        ? {
              endpoint:
                  localStackHost || isDocker ? "http://bods_integrated_data_localstack:4566" : "http://localhost:4566",
              forcePathStyle: true,
              credentials: {
                  accessKeyId: "DUMMY",
                  secretAccessKey: "DUMMY",
              },
          }
        : {}),
});

export const listS3Objects = async (input: ListObjectsV2CommandInput) => client.send(new ListObjectsV2Command(input));

export const listAllS3Objects = async (input: ListObjectsV2CommandInput) => {
    let continuationToken: string | undefined = undefined;
    const allObjects: _Object[] = [];

    try {
        do {
            const response: ListObjectsV2CommandOutput = await client.send(
                new ListObjectsV2Command({
                    ...input,
                    ContinuationToken: continuationToken,
                }),
            );

            if (response.Contents) {
                allObjects.push(...response.Contents);
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);
    } catch (error) {
        console.error("Error listing S3 objects:", error);
        throw error;
    }

    return allObjects;
};

export const getS3Object = async (input: GetObjectCommandInput) =>
    client.send(
        new GetObjectCommand({
            ...input,
            Key: input.Key ? decodeURIComponent(input.Key) : undefined,
        }),
    );

export const putS3Object = (input: PutObjectCommandInput) =>
    client.send(
        new PutObjectCommand({
            ...input,
            Key: input.Key ? replaceSpecialCharacters(input.Key) : undefined,
        }),
    );

export const startS3Upload = (
    bucket: string,
    key: string,
    body: PassThrough | Uint8Array | string,
    contentType: string,
    queueSize = 4,
    partSize = 1024 * 1024 * 5,
    leavePartsOnError = false,
) =>
    new Upload({
        client,
        params: {
            Bucket: bucket,
            Key: replaceSpecialCharacters(key),
            Body: body,
            ContentType: contentType,
        },
        queueSize,
        partSize,
        leavePartsOnError,
    });

export const getPresignedUrl = (input: GetObjectCommandInput, expiresIn: number) => {
    return getSignedUrl(
        client,
        new GetObjectCommand({
            ...input,
            Key: input.Key ? decodeURIComponent(input.Key) : undefined,
        }),
        { expiresIn },
    );
};

export const createLazyDownloadStreamFrom = (bucket: string, key: string): Readable => {
    let streamCreated = false;
    const stream = new PassThrough();

    stream.on("newListener", (event) => {
        if (!streamCreated && event === "data") {
            initDownloadStream(bucket, key, stream)
                .then(() => {
                    streamCreated = true;
                })
                .catch((e) => {
                    if (e instanceof Error) {
                        logger.error(e, "Error initialising stream");
                    }

                    throw e;
                });
        }
    });

    return stream;
};

export const initDownloadStream = async (bucket: string, key: string, stream: PassThrough) => {
    try {
        const { Body: body } = await getS3Object({ Bucket: bucket, Key: key });

        if (!body) {
            stream.emit("error", new Error(`Received undefined body from s3 when retrieving object ${bucket}/${key}`));
        } else if (!("on" in body)) {
            stream.emit(
                "error",
                new Error(
                    `Received a ReadableStream<any> or Blob from s3 when getting object ${bucket}/${key} instead of Readable`,
                ),
            );
        } else {
            body.on("error", (err) => stream.emit("error", err)).pipe(stream);
        }
    } catch (e) {
        stream.emit("error", e);
    }
};
