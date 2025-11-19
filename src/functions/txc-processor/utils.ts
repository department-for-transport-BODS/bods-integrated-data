import { DropOffType, NewStopTime, PickupType, Timepoint } from "@bods-integrated-data/shared/database";
import { getDate, getDateWithCustomFormat, getDuration } from "@bods-integrated-data/shared/dates";
import { AbstractTimingLink, Operator, Service, VehicleJourney } from "@bods-integrated-data/shared/schema";
import type { Dayjs } from "dayjs";

export const hasServiceExpired = (service: Service) => {
    const currentDate = getDate();
    const endDate = getDate(service.OperatingPeriod.EndDate);

    return endDate?.isBefore(currentDate, "day");
};

export const getPickupTypeFromStopActivity = (activity?: string, isLastStop = false) => {
    switch (activity) {
        case "pickUp":
        case "pickUpAndSetDown":
            return PickupType.Pickup;
        case "setDown":
        case "pass":
            return PickupType.NoPickup;
        default:
            return isLastStop ? PickupType.NoPickup : PickupType.Pickup;
    }
};

export const getDropOffTypeFromStopActivity = (activity?: string, isFirstStop = false) => {
    switch (activity) {
        case "setDown":
        case "pickUpAndSetDown":
            return DropOffType.DropOff;
        case "pickUp":
        case "pass":
            return DropOffType.NoDropOff;
        default:
            return isFirstStop ? DropOffType.NoDropOff : DropOffType.DropOff;
    }
};

export const getTimepointFromTimingStatus = (timingStatus?: string) => {
    return timingStatus === "principalTimingPoint" || timingStatus === "PTP" ? Timepoint.Exact : Timepoint.Approximate;
};

export const appendRolloverHours = (
    timeString: string,
    daysPastInitialServiceDay: number,
    isDepartureDayShift = false,
) => {
    const [hoursString] = timeString.split(":");

    let hours = Number.parseInt(hoursString);
    hours += (isDepartureDayShift ? daysPastInitialServiceDay + 1 : daysPastInitialServiceDay) * 24;

    return timeString.replace(hoursString, hours.toString());
};

/**
 * Maps journey pattern timing links to stop times and assumes the vehicle journey departure time as the
 * first stop's departure time. Where a journey pattern timing link property is not defined, its corresponding
 * property within the vehicle journey timing link is used, or a default value if neither are defined.
 * @param tripId Trip ID
 * @param vehicleJourney Associated vehicle journey
 * @param journeyPatternTimingLinks Journey pattern timing links
 * @returns An array of stop times
 */
export const mapTimingLinksToStopTimes = (
    tripId: string,
    vehicleJourney: VehicleJourney,
    journeyPatternTimingLinks: AbstractTimingLink[],
): NewStopTime[] => {
    const initialStopDepartureTime = getDateWithCustomFormat(vehicleJourney.DepartureTime, "HH:mm:ss");

    if (!initialStopDepartureTime.isValid()) {
        throw new Error(`Invalid departure time in vehicle journey with code: ${vehicleJourney.VehicleJourneyCode}`);
    }

    let currentStopDepartureTime = initialStopDepartureTime.clone();
    const initialStopDepartureDate = initialStopDepartureTime.startOf("day");
    let sequenceNumber = 0;
    const isDepartureDayShift = vehicleJourney.DepartureDayShift === 1;

    return journeyPatternTimingLinks.flatMap<NewStopTime>((journeyPatternTimingLink, index) => {
        const vehicleJourneyTimingLink = vehicleJourney.VehicleJourneyTimingLink?.find(
            (link) => link.JourneyPatternTimingLinkRef === journeyPatternTimingLink["@_id"],
        );

        const { nextArrivalTime, stopTime } = mapTimingLinkToStopTime(
            "from",
            initialStopDepartureDate,
            currentStopDepartureTime,
            tripId,
            sequenceNumber,
            journeyPatternTimingLink,
            vehicleJourneyTimingLink,
            index === 0,
            false,
            isDepartureDayShift,
        );

        currentStopDepartureTime = nextArrivalTime.clone();
        sequenceNumber++;

        const stopTimesToAdd: NewStopTime[] = [];

        if (stopTime) {
            stopTimesToAdd.push(stopTime);
        }

        if (index === journeyPatternTimingLinks.length - 1) {
            const { stopTime: finalStopTime } = mapTimingLinkToStopTime(
                "to",
                initialStopDepartureDate,
                currentStopDepartureTime,
                tripId,
                sequenceNumber,
                journeyPatternTimingLink,
                vehicleJourneyTimingLink,
                false,
                true,
                isDepartureDayShift,
            );

            if (finalStopTime) {
                stopTimesToAdd.push(finalStopTime);
            }
        }

        return stopTimesToAdd;
    });
};

/**
 * Map a timing link to a stop time. Either the From or To stop usage activity is used depending on the `stopUsageType`.
 * A run time will optionally be returned if it can be calculated.
 * @param stopUsageType Which stop usage to use (from or to)
 * @param initialStopDepartureDate Initial stop departure date (midnight)
 * @param currentStopDepartureTime Current stop departure time
 * @param tripId Trip ID
 * @param sequenceNumber Current sequence number
 * @param journeyPatternTimingLink Journey pattern timing link
 * @param vehicleJourneyTimingLink Vehicle journey timing link
 * @returns A stop time and optional run time
 */
export const mapTimingLinkToStopTime = (
    stopUsageType: "from" | "to",
    initialStopDepartureDate: Dayjs,
    currentStopDepartureTime: Dayjs,
    tripId: string,
    sequenceNumber: number,
    journeyPatternTimingLink: AbstractTimingLink,
    vehicleJourneyTimingLink?: AbstractTimingLink,
    isFirstStop = false,
    isLastStop = false,
    isDepartureDayShift = false,
): { nextArrivalTime: Dayjs; stopTime: NewStopTime } => {
    const journeyPatternTimingLinkStopUsage =
        stopUsageType === "from" ? journeyPatternTimingLink.From : journeyPatternTimingLink.To;
    const vehicleJourneyTimingLinkStopUsage =
        stopUsageType === "from" ? vehicleJourneyTimingLink?.From : vehicleJourneyTimingLink?.To;

    let stopPointRef =
        journeyPatternTimingLinkStopUsage?.StopPointRef || vehicleJourneyTimingLinkStopUsage?.StopPointRef;

    if (!stopPointRef) {
        throw new Error(
            `Missing stop point ref for journey pattern timing link with ref: ${journeyPatternTimingLink["@_id"]}`,
        );
    }

    let destinationStopPointRef = "";

    if (stopUsageType === "from") {
        destinationStopPointRef =
            journeyPatternTimingLink.To?.StopPointRef || vehicleJourneyTimingLink?.To?.StopPointRef || "";
    }

    stopPointRef = stopPointRef.toUpperCase();
    destinationStopPointRef = destinationStopPointRef.toUpperCase();

    const activity = journeyPatternTimingLinkStopUsage?.Activity || vehicleJourneyTimingLinkStopUsage?.Activity;
    const timingStatus =
        journeyPatternTimingLinkStopUsage?.TimingStatus || vehicleJourneyTimingLinkStopUsage?.TimingStatus;

    const arrivalTime = currentStopDepartureTime.clone();
    let departureTime = arrivalTime.clone();

    if (stopUsageType === "from") {
        const fromWaitTime = getFirstNonZeroDuration([
            journeyPatternTimingLink.From?.WaitTime,
            vehicleJourneyTimingLink?.From?.WaitTime,
        ]);

        if (fromWaitTime) {
            departureTime = departureTime.add(fromWaitTime);
        }
    }

    const toWaitTime = getFirstNonZeroDuration([
        journeyPatternTimingLink.To?.WaitTime,
        vehicleJourneyTimingLink?.To?.WaitTime,
    ]);

    if (toWaitTime) {
        departureTime = departureTime.add(toWaitTime);
    }

    let nextArrivalTime = departureTime.clone();
    const runTime = getFirstNonZeroDuration([journeyPatternTimingLink.RunTime, vehicleJourneyTimingLink?.RunTime]);

    if (runTime) {
        nextArrivalTime = nextArrivalTime.add(runTime);
    }

    let arrivalTimeString = arrivalTime.format("HH:mm:ss");
    let departureTimeString = departureTime.format("HH:mm:ss");

    const arrivalTimeDaysPastInitialServiceDay = arrivalTime.diff(initialStopDepartureDate, "day");
    const departureTimeDaysPastInitialServiceDay = departureTime.diff(initialStopDepartureDate, "day");

    if (arrivalTimeDaysPastInitialServiceDay > 0 || isDepartureDayShift) {
        arrivalTimeString = appendRolloverHours(
            arrivalTimeString,
            arrivalTimeDaysPastInitialServiceDay,
            isDepartureDayShift,
        );
    }

    if (departureTimeDaysPastInitialServiceDay > 0 || isDepartureDayShift) {
        departureTimeString = appendRolloverHours(
            departureTimeString,
            departureTimeDaysPastInitialServiceDay,
            isDepartureDayShift,
        );
    }

    return {
        nextArrivalTime,
        stopTime: {
            trip_id: tripId,
            stop_id: stopPointRef,
            destination_stop_id: destinationStopPointRef,
            arrival_time: arrivalTimeString,
            departure_time: departureTimeString,
            stop_sequence: sequenceNumber,
            stop_headsign: "",
            pickup_type: getPickupTypeFromStopActivity(activity, isLastStop),
            drop_off_type: getDropOffTypeFromStopActivity(activity, isFirstStop),
            shape_dist_traveled: null,
            timepoint: getTimepointFromTimingStatus(timingStatus),
        },
    };
};

/**
 * Iterates over an array of ISO 8601 durations and returns the first non-zero element as a duration object.
 * @param durationStrings Array of ISO 8601 durations
 * @returns The first non-zero duration, or undefined otherwise
 */
export const getFirstNonZeroDuration = (durationStrings: (string | undefined)[]) => {
    for (let i = 0; i < durationStrings.length; i++) {
        const durationString = durationStrings[i];

        if (durationString) {
            const duration = getDuration(durationString);

            if (duration.asSeconds() > 0) {
                return duration;
            }
        }
    }

    return undefined;
};

export const isRequiredTndsDataset = (key: string) => {
    return key.includes("/S/") || key.includes("/W/");
};

export const isRequiredTndsServiceMode = (mode?: string) => {
    return mode === "coach" || mode === "ferry" || mode === "metro" || mode === "tram" || mode === "underground";
};

/**
 * Get a journey pattern for a vehicle journey via a journey pattern ref. If the ref is omitted,
 * The vehicle journey ref is used to lookup a corresponding vehicle journey. The journey pattern ref
 * from that vehicle journey is then used. If the vehicle journey ref or both journey pattern refs
 * are omitted, no journey pattern is returned.
 * @param vehicleJourney The vehicle journey
 * @param vehicleJourneys The vehicles journeys from the given dataset
 * @param services The services from the given dataset
 * @returns A journey pattern if one can be determined
 */
export const getJourneyPatternForVehicleJourney = (
    vehicleJourney: VehicleJourney,
    vehicleJourneys: VehicleJourney[],
    services: Service[],
) => {
    let journeyPattern = services
        .flatMap((s) => s.StandardService.JourneyPattern)
        .find((journeyPattern) => journeyPattern["@_id"] === vehicleJourney.JourneyPatternRef);

    if (!journeyPattern) {
        const referencedVehicleJourney = vehicleJourneys.find((vj) => {
            return (
                vj.VehicleJourneyRef !== vehicleJourney.VehicleJourneyRef &&
                vj.VehicleJourneyCode === vehicleJourney.VehicleJourneyRef
            );
        });

        journeyPattern = services
            .flatMap((s) => s.StandardService.JourneyPattern)
            .find((journeyPattern) => journeyPattern["@_id"] === referencedVehicleJourney?.JourneyPatternRef);
    }

    return journeyPattern;
};

/**
 * Returns the national operator code for a given operator via the NationalOperatorCode property, or
 * falling back to the OperatorCode property if NationalOperatorCode is omitted. Returns undefined if
 * both are omitted.
 * @param operator The operator
 * @returns The national operator code, or undefined if one can't be determined
 */
export const getNationalOperatorCode = (operator: Operator) => operator.NationalOperatorCode || operator.OperatorCode;

/**
 * Checks if the given string is numeric
 * @param string
 * @returns {boolean}
 */
export const isNumeric = (string: string) => /^[+-]?\d+(\.\d+)?$/.test(string);

/**
 * Checks if the given coordinates are valid. Coordinates are considered valid if both
 * are defined, are numbers and not both zero (0, 0) or ("0", "0").
 *
 * @param coords Tuple of coordinates to validate
 */
export const areCoordinatesValid = <T extends string | number>(
    coords: readonly [T | undefined | null, T | undefined | null],
): coords is [T, T] =>
    coords[0] != null &&
    coords[1] != null &&
    coords[0] !== "" &&
    coords[1] !== "" &&
    isNumeric(coords[0].toString()) &&
    isNumeric(coords[1].toString()) &&
    !(coords[0].toString() === "0" && coords[1].toString() === "0");
