import { DropOffType, NewStopTime, PickupType, Timepoint } from "@bods-integrated-data/shared/database";
import { getDate } from "@bods-integrated-data/shared/dates";
import { AbstractTimingLink, Operator, Service, VehicleJourney } from "@bods-integrated-data/shared/schema";
import { describe, expect, it } from "vitest";
import {
    appendRolloverHours,
    areCoordinatesValid,
    getDropOffTypeFromStopActivity,
    getFirstNonZeroDuration,
    getJourneyPatternForVehicleJourney,
    getNationalOperatorCode,
    getPickupTypeFromStopActivity,
    getTimepointFromTimingStatus,
    isRequiredTndsDataset,
    isRequiredTndsServiceMode,
    mapTimingLinkToStopTime,
    mapTimingLinksToStopTimes,
} from "./utils";

describe("utils", () => {
    describe("getPickupTypeFromStopActivity", () => {
        it.each([
            ["pickUp", false, PickupType.Pickup],
            ["pickUpAndSetDown", false, PickupType.Pickup],
            ["setDown", false, PickupType.NoPickup],
            ["pass", false, PickupType.NoPickup],
            [undefined, false, PickupType.Pickup],
            [undefined, true, PickupType.NoPickup],
        ])("returns the correct pickup type for the activity", (activity, isLastStop, expected) => {
            const result = getPickupTypeFromStopActivity(activity, isLastStop);
            expect(result).toEqual(expected);
        });
    });

    describe("getDropOffTypeFromStopActivity", () => {
        it.each([
            ["pickUp", false, DropOffType.NoDropOff],
            ["pickUpAndSetDown", false, DropOffType.DropOff],
            ["setDown", false, DropOffType.DropOff],
            ["pass", false, DropOffType.NoDropOff],
            [undefined, true, DropOffType.NoDropOff],
            [undefined, false, DropOffType.DropOff],
        ])("returns the correct drop off type for the activity", (activity, isFirstStop, expected) => {
            const result = getDropOffTypeFromStopActivity(activity, isFirstStop);
            expect(result).toEqual(expected);
        });
    });

    describe("getTimepointFromTimingStatus", () => {
        it.each([
            ["principalTimingPoint", Timepoint.Exact],
            ["PTP", Timepoint.Exact],
            ["someOtherValue", Timepoint.Approximate],
            [undefined, Timepoint.Approximate],
        ])("returns the correct time point for the timing status: %o", (input, expected) => {
            const result = getTimepointFromTimingStatus(input);
            expect(result).toEqual(expected);
        });
    });

    describe("appendRolloverHours", () => {
        it("appends over 24 hours correctly", () => {
            expect(appendRolloverHours("00:00:00", 1)).toEqual("24:00:00");
        });
    });

    describe("mapTimingLinksToStopTimes", () => {
        it("throws an error when the departure time cannot be parsed", () => {
            const vehicleJourney: VehicleJourney = {
                DepartureTime: "",
                JourneyPatternRef: "",
                LineRef: "",
                ServiceRef: "",
                VehicleJourneyCode: "1",
            };

            expect(() => mapTimingLinksToStopTimes("trip_id", vehicleJourney, [])).toThrowError(
                `Invalid departure time in vehicle journey with code: ${vehicleJourney.VehicleJourneyCode}`,
            );
        });

        it("returns an empty array when there are no timing links", () => {
            const vehicleJourney: VehicleJourney = {
                DepartureTime: "00:00:00",
                JourneyPatternRef: "",
                LineRef: "",
                ServiceRef: "",
                VehicleJourneyCode: "1",
            };

            const result = mapTimingLinksToStopTimes("trip_id", vehicleJourney, []);
            expect(result).toHaveLength(0);
        });

        it("returns mapped stop times when there is at least one timing link", () => {
            const vehicleJourney: VehicleJourney = {
                DepartureTime: "00:00:00",
                JourneyPatternRef: "",
                LineRef: "",
                ServiceRef: "",
                VehicleJourneyCode: "1",
                VehicleJourneyTimingLink: [
                    {
                        JourneyPatternTimingLinkRef: "1",
                    },
                ],
            };

            const journeyPatternTimingLinks: AbstractTimingLink[] = [
                {
                    "@_id": "1",
                    From: {
                        StopPointRef: "1",
                        TimingStatus: "principalTimingPoint",
                    },
                    To: {
                        StopPointRef: "stop_id_2",
                        WaitTime: "PT15S",
                    },
                    RunTime: "PT1M",
                },
                {
                    "@_id": "2",
                    From: {
                        StopPointRef: "stop_id_2",
                        TimingStatus: "principalTimingPoint",
                        WaitTime: "PT30S",
                        Activity: "setDown",
                    },
                    To: {
                        StopPointRef: "3",
                        WaitTime: "PT10S",
                    },
                    RunTime: "PT5M",
                },
                {
                    "@_id": "3",
                    From: {
                        StopPointRef: "3",
                        TimingStatus: "timeInfoPoint",
                        WaitTime: "PT2M",
                    },
                    To: {
                        StopPointRef: "4",
                        TimingStatus: "timeInfoPoint",
                    },
                    RunTime: "PT10M",
                },
            ];

            const expected: NewStopTime[] = [
                {
                    trip_id: "trip_id",
                    stop_id: "1",
                    destination_stop_id: "STOP_ID_2",
                    arrival_time: "00:00:00",
                    departure_time: "00:00:15",
                    stop_sequence: 0,
                    stop_headsign: "",
                    pickup_type: PickupType.Pickup,
                    drop_off_type: DropOffType.NoDropOff,
                    shape_dist_traveled: null,
                    timepoint: Timepoint.Exact,
                },
                {
                    trip_id: "trip_id",
                    stop_id: "STOP_ID_2",
                    destination_stop_id: "3",
                    arrival_time: "00:01:15",
                    departure_time: "00:01:55",
                    stop_sequence: 1,
                    stop_headsign: "",
                    pickup_type: PickupType.NoPickup,
                    drop_off_type: DropOffType.DropOff,
                    shape_dist_traveled: null,
                    timepoint: Timepoint.Exact,
                },
                {
                    trip_id: "trip_id",
                    stop_id: "3",
                    destination_stop_id: "4",
                    arrival_time: "00:06:55",
                    departure_time: "00:08:55",
                    stop_sequence: 2,
                    stop_headsign: "",
                    pickup_type: PickupType.Pickup,
                    drop_off_type: DropOffType.DropOff,
                    shape_dist_traveled: null,
                    timepoint: Timepoint.Approximate,
                },
                {
                    trip_id: "trip_id",
                    stop_id: "4",
                    destination_stop_id: "",
                    arrival_time: "00:18:55",
                    departure_time: "00:18:55",
                    stop_sequence: 3,
                    stop_headsign: "",
                    pickup_type: PickupType.NoPickup,
                    drop_off_type: DropOffType.DropOff,
                    shape_dist_traveled: null,
                    timepoint: Timepoint.Approximate,
                },
            ];

            const result = mapTimingLinksToStopTimes("trip_id", vehicleJourney, journeyPatternTimingLinks);
            expect(result).toEqual(expected);
        });

        it("returns an empty array when there are no timing links", () => {
            const vehicleJourney: VehicleJourney = {
                DepartureTime: "00:00:00",
                JourneyPatternRef: "",
                LineRef: "",
                ServiceRef: "",
                VehicleJourneyCode: "1",
            };

            const result = mapTimingLinksToStopTimes("trip_id", vehicleJourney, []);
            expect(result).toHaveLength(0);
        });

        it("correctly sets arrival times and departure times when a service day exceeds 24:00:00", () => {
            const vehicleJourney: VehicleJourney = {
                DepartureTime: "23:30:00",
                JourneyPatternRef: "",
                LineRef: "",
                ServiceRef: "",
                VehicleJourneyCode: "1",
                VehicleJourneyTimingLink: [
                    {
                        JourneyPatternTimingLinkRef: "1",
                    },
                ],
            };

            const journeyPatternTimingLinks: AbstractTimingLink[] = [
                {
                    "@_id": "1",
                    From: {
                        StopPointRef: "1",
                        Activity: "pickUp",
                        TimingStatus: "principalTimingPoint",
                    },
                    To: {
                        StopPointRef: "2",
                    },
                    RunTime: "PT35M",
                },
                {
                    "@_id": "2",
                    From: {
                        StopPointRef: "2",
                        Activity: "pickUpAndSetDown",
                        TimingStatus: "principalTimingPoint",
                    },
                    To: {
                        StopPointRef: "3",
                    },
                    RunTime: "PT25H",
                },
                {
                    "@_id": "3",
                    From: {
                        StopPointRef: "3",
                        Activity: "pickUpAndSetDown",
                        TimingStatus: "timeInfoPoint",
                    },
                    To: {
                        StopPointRef: "4",
                        Activity: "setDown",
                        TimingStatus: "timeInfoPoint",
                    },
                    RunTime: "PT15S",
                },
            ];

            const expected: NewStopTime[] = [
                {
                    trip_id: "trip_id",
                    stop_id: "1",
                    destination_stop_id: "2",
                    arrival_time: "23:30:00",
                    departure_time: "23:30:00",
                    stop_sequence: 0,
                    stop_headsign: "",
                    pickup_type: PickupType.Pickup,
                    drop_off_type: DropOffType.NoDropOff,
                    shape_dist_traveled: null,
                    timepoint: Timepoint.Exact,
                },
                {
                    trip_id: "trip_id",
                    stop_id: "2",
                    destination_stop_id: "3",
                    arrival_time: "24:05:00",
                    departure_time: "24:05:00",
                    stop_sequence: 1,
                    stop_headsign: "",
                    pickup_type: PickupType.Pickup,
                    drop_off_type: DropOffType.DropOff,
                    shape_dist_traveled: null,
                    timepoint: Timepoint.Exact,
                },
                {
                    trip_id: "trip_id",
                    stop_id: "3",
                    destination_stop_id: "4",
                    arrival_time: "49:05:00",
                    departure_time: "49:05:00",
                    stop_sequence: 2,
                    stop_headsign: "",
                    pickup_type: PickupType.Pickup,
                    drop_off_type: DropOffType.DropOff,
                    shape_dist_traveled: null,
                    timepoint: Timepoint.Approximate,
                },
                {
                    trip_id: "trip_id",
                    stop_id: "4",
                    destination_stop_id: "",
                    arrival_time: "49:05:15",
                    departure_time: "49:05:15",
                    stop_sequence: 3,
                    stop_headsign: "",
                    pickup_type: PickupType.NoPickup,
                    drop_off_type: DropOffType.DropOff,
                    shape_dist_traveled: null,
                    timepoint: Timepoint.Approximate,
                },
            ];

            const result = mapTimingLinksToStopTimes("trip_id", vehicleJourney, journeyPatternTimingLinks);
            expect(result).toEqual(expected);
        });

        it("correctly handles DepartureDayShift", () => {
            const vehicleJourney: VehicleJourney = {
                DepartureTime: "00:10:00",
                DepartureDayShift: 1,
                JourneyPatternRef: "",
                LineRef: "",
                ServiceRef: "",
                VehicleJourneyCode: "1",
                VehicleJourneyTimingLink: [
                    {
                        JourneyPatternTimingLinkRef: "1",
                    },
                ],
            };

            const journeyPatternTimingLinks: AbstractTimingLink[] = [
                {
                    "@_id": "1",
                    From: {
                        StopPointRef: "1",
                        Activity: "pickUp",
                        TimingStatus: "principalTimingPoint",
                        WaitTime: "PT2M",
                    },
                    To: {
                        StopPointRef: "2",
                    },
                    RunTime: "PT35M",
                },
                {
                    "@_id": "2",
                    From: {
                        StopPointRef: "2",
                        Activity: "pickUpAndSetDown",
                        TimingStatus: "principalTimingPoint",
                    },
                    To: {
                        StopPointRef: "3",
                    },
                    RunTime: "PT25H",
                },
                {
                    "@_id": "3",
                    From: {
                        StopPointRef: "3",
                        Activity: "pickUpAndSetDown",
                        TimingStatus: "timeInfoPoint",
                    },
                    To: {
                        StopPointRef: "4",
                        Activity: "setDown",
                        TimingStatus: "timeInfoPoint",
                    },
                    RunTime: "PT15S",
                },
            ];

            const expected: NewStopTime[] = [
                {
                    trip_id: "trip_id",
                    stop_id: "1",
                    destination_stop_id: "2",
                    arrival_time: "24:10:00",
                    departure_time: "24:12:00",
                    stop_sequence: 0,
                    stop_headsign: "",
                    pickup_type: PickupType.Pickup,
                    drop_off_type: DropOffType.NoDropOff,
                    shape_dist_traveled: null,
                    timepoint: Timepoint.Exact,
                },
                {
                    trip_id: "trip_id",
                    stop_id: "2",
                    destination_stop_id: "3",
                    arrival_time: "24:47:00",
                    departure_time: "24:47:00",
                    stop_sequence: 1,
                    stop_headsign: "",
                    pickup_type: PickupType.Pickup,
                    drop_off_type: DropOffType.DropOff,
                    shape_dist_traveled: null,
                    timepoint: Timepoint.Exact,
                },
                {
                    trip_id: "trip_id",
                    stop_id: "3",
                    destination_stop_id: "4",
                    arrival_time: "49:47:00",
                    departure_time: "49:47:00",
                    stop_sequence: 2,
                    stop_headsign: "",
                    pickup_type: PickupType.Pickup,
                    drop_off_type: DropOffType.DropOff,
                    shape_dist_traveled: null,
                    timepoint: Timepoint.Approximate,
                },
                {
                    trip_id: "trip_id",
                    stop_id: "4",
                    destination_stop_id: "",
                    arrival_time: "49:47:15",
                    departure_time: "49:47:15",
                    stop_sequence: 3,
                    stop_headsign: "",
                    pickup_type: PickupType.NoPickup,
                    drop_off_type: DropOffType.DropOff,
                    shape_dist_traveled: null,
                    timepoint: Timepoint.Approximate,
                },
            ];

            const result = mapTimingLinksToStopTimes("trip_id", vehicleJourney, journeyPatternTimingLinks);
            expect(result).toEqual(expected);
        });
    });

    describe("mapTimingLinkToStopTime", () => {
        it("throws an error when no stop point ref is found", () => {
            const currentDepartureTime = getDate("00:00:00");
            const journeyPatternTimingLink: AbstractTimingLink = {
                "@_id": "1",
            };

            expect(() =>
                mapTimingLinkToStopTime(
                    "from",
                    currentDepartureTime,
                    currentDepartureTime,
                    "trip_id",
                    0,
                    journeyPatternTimingLink,
                ),
            ).toThrowError(
                `Missing stop point ref for journey pattern timing link with ref: ${journeyPatternTimingLink["@_id"]}`,
            );
        });

        it("returns a stop time using journey pattern timing link 'From' data when it is defined", () => {
            const currentDepartureTime = getDate("01/01/2024 00:00:00");
            const journeyPatternTimingLink: AbstractTimingLink = {
                From: {
                    StopPointRef: "stop_id",
                    Activity: "pickUpAndSetDown",
                    TimingStatus: "principalTimingPoint",
                },
                RunTime: "PT1M",
            };

            const stopTime: NewStopTime = {
                trip_id: "trip_id",
                stop_id: "STOP_ID",
                destination_stop_id: "",
                arrival_time: "00:00:00",
                departure_time: "00:00:00",
                stop_sequence: 0,
                stop_headsign: "",
                pickup_type: PickupType.Pickup,
                drop_off_type: DropOffType.DropOff,
                shape_dist_traveled: null,
                timepoint: Timepoint.Exact,
            };

            const result = mapTimingLinkToStopTime(
                "from",
                currentDepartureTime,
                currentDepartureTime,
                "trip_id",
                0,
                journeyPatternTimingLink,
            );

            expect(result.nextArrivalTime.format("HH:mm:ss")).toEqual("00:01:00");
            expect(result.stopTime).toEqual(stopTime);
        });

        it("returns a stop time using vehicle journey timing link 'From' data when journey pattern timing link data is not defined", () => {
            const currentDepartureTime = getDate("01/01/2024 00:00:00");
            const vehicleJourneyTimingLink: AbstractTimingLink = {
                To: {
                    StopPointRef: "stop_id",
                    Activity: "pickUpAndSetDown",
                    TimingStatus: "principalTimingPoint",
                },
                RunTime: "PT1M",
            };

            const stopTime: NewStopTime = {
                trip_id: "trip_id",
                stop_id: "STOP_ID",
                destination_stop_id: "",
                arrival_time: "00:00:00",
                departure_time: "00:00:00",
                stop_sequence: 0,
                stop_headsign: "",
                pickup_type: PickupType.Pickup,
                drop_off_type: DropOffType.DropOff,
                shape_dist_traveled: null,
                timepoint: Timepoint.Exact,
            };

            const result = mapTimingLinkToStopTime(
                "to",
                currentDepartureTime,
                currentDepartureTime,
                "trip_id",
                0,
                {},
                vehicleJourneyTimingLink,
            );

            expect(result.nextArrivalTime.format("HH:mm:ss")).toEqual("00:01:00");
            expect(result.stopTime).toEqual(stopTime);
        });

        it("returns a stop time using journey pattern timing link 'To' data when it is defined", () => {
            const currentDepartureTime = getDate("01/01/2024 00:00:00");
            const journeyPatternTimingLink: AbstractTimingLink = {
                To: {
                    StopPointRef: "stop_id",
                    Activity: "pickUpAndSetDown",
                    TimingStatus: "principalTimingPoint",
                },
                RunTime: "PT1M",
            };

            const stopTime: NewStopTime = {
                trip_id: "trip_id",
                stop_id: "STOP_ID",
                destination_stop_id: "",
                arrival_time: "00:00:00",
                departure_time: "00:00:00",
                stop_sequence: 0,
                stop_headsign: "",
                pickup_type: PickupType.Pickup,
                drop_off_type: DropOffType.DropOff,
                shape_dist_traveled: null,
                timepoint: Timepoint.Exact,
            };

            const result = mapTimingLinkToStopTime(
                "to",
                currentDepartureTime,
                currentDepartureTime,
                "trip_id",
                0,
                journeyPatternTimingLink,
            );

            expect(result.nextArrivalTime.format("HH:mm:ss")).toEqual("00:01:00");
            expect(result.stopTime).toEqual(stopTime);
        });

        it("returns a stop time using vehicle journey timing link 'To' data when journey pattern timing link data is not defined", () => {
            const currentDepartureTime = getDate("01/01/2024 00:00:00");
            const vehicleJourneyTimingLink: AbstractTimingLink = {
                From: {
                    StopPointRef: "stop_id",
                    Activity: "pickUpAndSetDown",
                    TimingStatus: "principalTimingPoint",
                },
                RunTime: "PT1M",
            };

            const stopTime: NewStopTime = {
                trip_id: "trip_id",
                stop_id: "STOP_ID",
                destination_stop_id: "",
                arrival_time: "00:00:00",
                departure_time: "00:00:00",
                stop_sequence: 0,
                stop_headsign: "",
                pickup_type: PickupType.Pickup,
                drop_off_type: DropOffType.DropOff,
                shape_dist_traveled: null,
                timepoint: Timepoint.Exact,
            };

            const result = mapTimingLinkToStopTime(
                "from",
                currentDepartureTime,
                currentDepartureTime,
                "trip_id",
                0,
                {},
                vehicleJourneyTimingLink,
            );

            expect(result.nextArrivalTime.format("HH:mm:ss")).toEqual("00:01:00");
            expect(result.stopTime).toEqual(stopTime);
        });

        it("returns a stop time with a different departure time when wait time data is defined", () => {
            const currentDepartureTime = getDate("01/01/2024 00:00:00");
            const journeyPatternTimingLink: AbstractTimingLink = {
                From: {
                    StopPointRef: "stop_id",
                    Activity: "pickUpAndSetDown",
                    TimingStatus: "principalTimingPoint",
                    WaitTime: "PT30S",
                },
                RunTime: "PT1M",
            };

            const stopTime: NewStopTime = {
                trip_id: "trip_id",
                stop_id: "STOP_ID",
                destination_stop_id: "",
                arrival_time: "00:00:00",
                departure_time: "00:00:30",
                stop_sequence: 0,
                stop_headsign: "",
                pickup_type: PickupType.Pickup,
                drop_off_type: DropOffType.DropOff,
                shape_dist_traveled: null,
                timepoint: Timepoint.Exact,
            };

            const result = mapTimingLinkToStopTime(
                "from",
                currentDepartureTime,
                currentDepartureTime,
                "trip_id",
                0,
                journeyPatternTimingLink,
            );

            expect(result.nextArrivalTime.format("HH:mm:ss")).toEqual("00:01:30");
            expect(result.stopTime).toEqual(stopTime);
        });
    });

    describe("getFirstNonZeroDuration", () => {
        it("returns undefined when there are no durations", () => {
            const result = getFirstNonZeroDuration([]);
            expect(result).toBeUndefined();
        });

        it("returns undefined when all durations are zero", () => {
            const result = getFirstNonZeroDuration(["PT0S", "PT0M", "PT0H"]);
            expect(result).toBeUndefined();
        });

        it.each([
            [["PT1S", "PT0M", "PT0H"], "PT1S"],
            [["PT0S", "PT1M", "PT0H"], "PT1M"],
            [["PT0S", "PT0M", "PT1H"], "PT1H"],
        ])("returns the non-zero duration when at least one exists", (input, expected) => {
            const result = getFirstNonZeroDuration(input);
            expect(result?.toISOString()).toEqual(expected);
        });
    });

    describe("isRequiredTndsDataset", () => {
        it.each([
            ["/L/", false],
            ["/S/", true],
            ["/W/", true],
            ["L", false],
            ["", false],
            ["random", false],
        ])("returns true when the key is a required TNDS dataset key", (input, expected) => {
            const result = isRequiredTndsDataset(input);
            expect(result).toEqual(expected);
        });
    });

    describe("isRequiredTndsServiceMode", () => {
        it.each([
            { mode: "coach", required: true },
            { mode: "ferry", required: true },
            { mode: "metro", required: true },
            { mode: "tram", required: true },
            { mode: "underground", required: true },
            { mode: "air", required: false },
            { mode: "bus", required: false },
            { mode: "telecabine", required: false },
            { mode: "train", required: false },
            { mode: "", required: false },
            { mode: "random", required: false },
            { mode: undefined, required: false },
        ])("returns $required when the required TNDS service mode is $mode", ({ mode, required }) => {
            const result = isRequiredTndsServiceMode(mode);
            expect(result).toEqual(required);
        });
    });

    describe("getJourneyPatternForVehicleJourney", () => {
        it("returns a journey pattern when a reference is found with the journey pattern ref", () => {
            const vehicleJourneys: VehicleJourney[] = [
                {
                    VehicleJourneyCode: "1",
                    JourneyPatternRef: "2",
                    DepartureTime: "",
                    ServiceRef: "",
                    LineRef: "",
                },
                {
                    VehicleJourneyCode: "3",
                    JourneyPatternRef: "4",
                    DepartureTime: "",
                    ServiceRef: "",
                    LineRef: "",
                },
            ];

            const services: Service[] = [
                {
                    StandardService: {
                        JourneyPattern: [
                            {
                                "@_id": "2",
                                JourneyPatternSectionRefs: [],
                            },
                        ],
                    },
                    ServiceCode: "",
                    OperatingPeriod: {
                        StartDate: "",
                    },
                    Lines: {
                        Line: [],
                    },
                    RegisteredOperatorRef: "",
                },
            ];

            const journeyPattern = getJourneyPatternForVehicleJourney(vehicleJourneys[0], vehicleJourneys, services);
            expect(journeyPattern).toEqual(services[0].StandardService.JourneyPattern[0]);
        });

        it("returns a journey pattern when a reference is not found with the journey pattern ref but instead a referenced vehicle journey", () => {
            const vehicleJourneys: VehicleJourney[] = [
                {
                    VehicleJourneyCode: "1",
                    VehicleJourneyRef: "3",
                    DepartureTime: "",
                    ServiceRef: "",
                    LineRef: "",
                },
                {
                    VehicleJourneyCode: "3",
                    JourneyPatternRef: "4",
                    DepartureTime: "",
                    ServiceRef: "",
                    LineRef: "",
                },
            ];

            const services: Service[] = [
                {
                    StandardService: {
                        JourneyPattern: [
                            {
                                "@_id": "4",
                                JourneyPatternSectionRefs: [],
                            },
                        ],
                    },
                    ServiceCode: "",
                    OperatingPeriod: {
                        StartDate: "",
                    },
                    Lines: {
                        Line: [],
                    },
                    RegisteredOperatorRef: "",
                },
            ];

            const journeyPattern = getJourneyPatternForVehicleJourney(vehicleJourneys[0], vehicleJourneys, services);
            expect(journeyPattern).toEqual(services[0].StandardService.JourneyPattern[0]);
        });

        it("returns undefined when a reference is not found for the given vehicle journey", () => {
            const vehicleJourneys: VehicleJourney[] = [
                {
                    VehicleJourneyCode: "1",
                    JourneyPatternRef: "2",
                    DepartureTime: "",
                    ServiceRef: "",
                    LineRef: "",
                },
                {
                    VehicleJourneyCode: "3",
                    JourneyPatternRef: "4",
                    DepartureTime: "",
                    ServiceRef: "",
                    LineRef: "",
                },
            ];

            const services: Service[] = [
                {
                    StandardService: {
                        JourneyPattern: [
                            {
                                "@_id": "4",
                                JourneyPatternSectionRefs: [],
                            },
                        ],
                    },
                    ServiceCode: "",
                    OperatingPeriod: {
                        StartDate: "",
                    },
                    Lines: {
                        Line: [],
                    },
                    RegisteredOperatorRef: "",
                },
            ];

            const journeyPattern = getJourneyPatternForVehicleJourney(vehicleJourneys[0], vehicleJourneys, services);
            expect(journeyPattern).toBeUndefined();
        });

        it("returns undefined when a reference is not found for the services", () => {
            const vehicleJourneys: VehicleJourney[] = [
                {
                    VehicleJourneyCode: "1",
                    JourneyPatternRef: "2",
                    DepartureTime: "",
                    ServiceRef: "",
                    LineRef: "",
                },
                {
                    VehicleJourneyCode: "3",
                    JourneyPatternRef: "4",
                    DepartureTime: "",
                    ServiceRef: "",
                    LineRef: "",
                },
            ];

            const services: Service[] = [
                {
                    StandardService: {
                        JourneyPattern: [
                            {
                                "@_id": "5",
                                JourneyPatternSectionRefs: [],
                            },
                        ],
                    },
                    ServiceCode: "",
                    OperatingPeriod: {
                        StartDate: "",
                    },
                    Lines: {
                        Line: [],
                    },
                    RegisteredOperatorRef: "",
                },
            ];

            const journeyPattern = getJourneyPatternForVehicleJourney(vehicleJourneys[0], vehicleJourneys, services);
            expect(journeyPattern).toBeUndefined();
        });
    });

    describe("getNationalOperatorCode", () => {
        it("returns the national operator code when the NationalOperatorCode is defined", () => {
            const operator: Operator = {
                "@_id": "1",
                NationalOperatorCode: "noc",
                OperatorShortName: "name",
            };

            const result = getNationalOperatorCode(operator);
            expect(result).toEqual("noc");
        });

        it("returns the operator code when the NationalOperatorCode is undefined but OperatorCode is defined", () => {
            const operator: Operator = {
                "@_id": "1",
                OperatorCode: "noc",
                OperatorShortName: "name",
            };

            const result = getNationalOperatorCode(operator);
            expect(result).toEqual("noc");
        });

        it("returns undefined when both operator codes are omitted", () => {
            const operator: Operator = {
                "@_id": "1",
                OperatorShortName: "name",
            };

            const result = getNationalOperatorCode(operator);
            expect(result).toBeUndefined();
        });
    });

    describe("areCoordinatesValid", () => {
        it.each([
            [[51.5074, -0.1278] as const, true],
            [[1, 2] as const, true],
            [[0, -1.234] as const, true],
            [["0", "-1.234"] as const, true],
            [["c", -1.234] as const, false],
            [[0, 0] as const, false],
            [["0", "0"] as const, false],
            [["0", 0] as const, false],
            [["1.234"] as const, false],
            // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        ])("validates coordinates %s as %s", (coordinates: any, expected) => {
            expect(areCoordinatesValid(coordinates)).toEqual(expected);
        });
    });
});
