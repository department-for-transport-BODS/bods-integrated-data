import Pino, { Logger } from "pino";
import { lambdaRequestTracker, pinoLambdaDestination } from "pino-lambda";
import { z } from "zod";

// Define a custom logger type to allow extra props to be included in logs
type CustomLogger = Logger & {
    filepath?: string;
    subscriptionId?: string;
    service?: string;
    operatorRef?: string;
    mode?: string;
    username?: string;
    url?: string;
    requestorRef?: string;
};

export const logger = Pino(
    {
        level: process.env.LOG_LEVEL || "info",
        mixin: (_mergeObject, _level, customLogger: CustomLogger) => ({
            filepath: customLogger.filepath,
            subscriptionId: customLogger.subscriptionId,
            service: customLogger.service,
            operatorRef: customLogger.operatorRef,
            mode: customLogger.mode,
            username: customLogger.username,
            url: customLogger.url,
            requestorRef: customLogger.requestorRef,
        }),
    },
    pinoLambdaDestination(),
) as CustomLogger;

export const withLambdaRequestTracker = lambdaRequestTracker();

/**
 * Set a global error map for Zod so that we can log invalid data for better troubleshooting.
 * Password fields are excluded.
 */
export const errorMapWithDataLogging: Parameters<typeof z.setErrorMap>[0] = (issue, ctx) => {
    const pathContainsPasswordField = issue.path.some((pathItem) => {
        return typeof pathItem === "string" && pathItem.toLowerCase().includes("password");
    });

    if (!pathContainsPasswordField) {
        logger.debug(`Zod error message="${ctx.defaultError}", path="${issue.path.join(".")}", data="${ctx.data}"`);
    }

    return {
        message: ctx.defaultError,
    };
};
