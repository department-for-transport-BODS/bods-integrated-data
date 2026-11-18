import { PassThrough } from "node:stream";
import { getDate } from "@bods-integrated-data/shared/dates";
import { errorMapWithDataLogging, logger, withLambdaRequestTracker } from "@bods-integrated-data/shared/logger";
import { startS3Upload } from "@bods-integrated-data/shared/s3";
import { getSecret } from "@bods-integrated-data/shared/secretsManager";
import { Handler } from "aws-lambda";
import { Client } from "basic-ftp";
import { z } from "zod";

z.setErrorMap(errorMapWithDataLogging);

interface FtpCredentials {
    host: string;
    user: string;
    password: string;
}

const listTndsFileNames = async (client: Client): Promise<string[]> => {
    const allFiles = await client.list();

    return allFiles
        .filter(
            /**
             * The NCSD.zip file, which represents coach data, is excluded because coach data is now retrieved from BODS.
             * CSV files containing useful meta information have been temporarily included because we want to analyse them during the coach data integration work.
             */
            (file) => (file.name.includes(".zip") && file.name !== "NCSD.zip") || file.name.includes(".csv"),
        )
        .map((file) => file.name);
};

const getContentType = (fileName: string) => {
    if (fileName.endsWith(".zip")) {
        return "application/zip";
    }

    if (fileName.endsWith(".csv")) {
        return "text/csv";
    }

    return "text/plain";
};

const streamFileFromFtpToS3 = async (client: Client, fileName: string, bucket: string, prefix: string) => {
    const body = new PassThrough();
    const upload = startS3Upload(bucket, `${prefix}/${fileName}`, body, getContentType(fileName));

    const download = client.downloadTo(body, fileName).catch((error: Error) => {
        body.destroy(error);
        throw error;
    });

    await Promise.all([download, upload.done()]);
};

const getTndsDataAndUploadToS3 = async (
    txcZippedBucketName: string,
    ftpCredentials: FtpCredentials,
    prefix: string,
) => {
    const { host, user, password } = ftpCredentials;
    const timeoutMs = 600000;
    const client = new Client(timeoutMs);
    try {
        await client.access({
            host,
            user,
            password,
        });

        const fileNames = await listTndsFileNames(client);

        logger.info(`Streaming ${fileNames.length} TNDS files from FTP to S3`);

        for (const fileName of fileNames) {
            await streamFileFromFtpToS3(client, fileName, txcZippedBucketName, prefix);
        }
    } finally {
        client.close();
    }
};

export const handler: Handler = async (event, context) => {
    withLambdaRequestTracker(event ?? {}, context ?? {});

    const { TXC_ZIPPED_BUCKET_NAME: txcZippedBucketName, TNDS_FTP_ARN: ftpArn } = process.env;

    if (!txcZippedBucketName || !ftpArn) {
        throw new Error("Missing env vars - TXC_ZIPPED_BUCKET_NAME and TNDS_FTP_ARN must be set");
    }

    try {
        const credentials = await getSecret<FtpCredentials>({ SecretId: ftpArn });

        logger.info("Starting retrieval of TNDS TXC data");

        const prefix = getDate().format("YYYYMMDD");
        await getTndsDataAndUploadToS3(txcZippedBucketName, credentials, prefix);

        logger.info("TNDS TXC retrieval complete");

        return {
            tndsTxcZippedBucketName: txcZippedBucketName,
            prefix,
        };
    } catch (e) {
        if (e instanceof Error) {
            logger.error(e, "There was an error retrieving TNDS TXC data");
        }

        throw e;
    }
};
