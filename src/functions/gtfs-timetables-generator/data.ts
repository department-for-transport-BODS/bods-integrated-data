import { RegionCode } from "@bods-integrated-data/shared/constants";
import { KyselyDb, Trip } from "@bods-integrated-data/shared/database";
import { getDate } from "@bods-integrated-data/shared/dates";
import { NotNull, sql } from "kysely";

export type Query = {
    getQuery: () => string;
    forceQuote?: string[];
    fileName: Files;
};

export type GtfsFile = {
    fileName: Files;
    include: boolean;
};

export const createTripTable = async (dbClient: KyselyDb) => {
    await dbClient.schema.dropTable("trip_ALL").ifExists().execute();
    await sql`CREATE TABLE ${sql.table("trip_ALL")} (LIKE ${sql.table("trip")} INCLUDING ALL)`.execute(dbClient);

    await dbClient
        .insertInto("trip_ALL")
        .expression((eb) =>
            eb
                .selectFrom("trip")
                .selectAll("trip")
                .distinctOn([
                    "trip.route_id",
                    "trip.service_id",
                    "trip.ticket_machine_journey_code",
                    "trip.direction",
                    "trip.origin_stop_ref",
                    "trip.destination_stop_ref",
                    "trip.departure_time",
                ])
                .orderBy([
                    "trip.route_id",
                    "trip.service_id",
                    "trip.ticket_machine_journey_code",
                    "trip.direction",
                    "trip.origin_stop_ref",
                    "trip.destination_stop_ref",
                    "trip.departure_time",
                    "trip.revision_number desc",
                ]),
        )
        .execute();
};

export const createRegionalTripTable = async (dbClient: KyselyDb, regionCode: RegionCode) => {
    if (regionCode === "ALL") {
        return;
    }

    await sql`CREATE TABLE ${sql.table(`trip_${regionCode}`)} (LIKE ${sql.table("trip_ALL")} INCLUDING ALL)`.execute(
        dbClient,
    );

    await dbClient
        .insertInto(`trip_${regionCode}`)
        .expression((eb) => {
            let query = eb
                .selectFrom("trip_ALL")
                .selectAll("trip_ALL")
                .innerJoin("stop_time", "stop_time.trip_id", "trip_ALL.id")
                .innerJoin("stop", "stop.id", "stop_time.stop_id")
                .distinct();

            if (regionCode === "E") {
                query = query.where("stop.region_code", "in", ["EA", "EM", "L", "NE", "NW", "SE", "SW", "WM", "Y"]);
            } else {
                query = query.where("stop.region_code", "=", regionCode);
            }

            return query;
        })
        .execute();
};

/**
 * Creates the `trip_E` table for England by:
 * 1. Creating the table with the same schema as `trip_ALL`.
 * 2. Populating it with the union of all regional trip tables for England.
 *
 * The following regions are counted as England:
 * - EA (East Anglia)
 * - EM (East Midlands)
 * - L  (London)
 * - NE (North East)
 * - NW (North West)
 * - SE (South East)
 * - SW (South West)
 * - WM (West Midlands)
 * - Y  (Yorkshire)
 *
 * This logic has been moved to its own function to avoid Lambda timeouts.
 *
 * @param dbClient - Kysely database client
 */
export const createEnglandTripTable = async (dbClient: KyselyDb) => {
    await sql`CREATE TABLE ${sql.table("trip_E")} (LIKE ${sql.table("trip_ALL")} INCLUDING ALL)`.execute(dbClient);

    await dbClient
        .insertInto("trip_E")
        .expression(
            dbClient
                .selectFrom("trip_EA")
                .selectAll()
                .union(dbClient.selectFrom("trip_EM").selectAll())
                .union(dbClient.selectFrom("trip_L").selectAll())
                .union(dbClient.selectFrom("trip_NE").selectAll())
                .union(dbClient.selectFrom("trip_NW").selectAll())
                .union(dbClient.selectFrom("trip_SE").selectAll())
                .union(dbClient.selectFrom("trip_SW").selectAll())
                .union(dbClient.selectFrom("trip_WM").selectAll())
                .union(dbClient.selectFrom("trip_Y").selectAll()),
        )
        .execute();
};

export const exportDataToS3 = async (queries: Query[], outputBucket: string, dbClient: KyselyDb, filePath: string) => {
    await Promise.all(
        queries.map((query) => {
            let options = "format csv, header true";

            if (query.forceQuote?.length) {
                options += `, force_quote(${query.forceQuote.join(",")})`;
            }

            return sql`
                SELECT * from aws_s3.query_export_to_s3('${sql.raw(query.getQuery())}',
                    aws_commons.create_s3_uri('${sql.raw(outputBucket)}', '${sql.raw(`${filePath}/${query.fileName}`)}.txt', 'eu-west-2'),
                    options :='${sql.raw(options)}'
                );
            `.execute(dbClient);
        }),
    );
};

export const dropRegionalTripTable = async (dbClient: KyselyDb, regionCode: RegionCode) => {
    await dbClient.schema.dropTable(`trip_${regionCode}`).ifExists().execute();
};

export enum Files {
    AGENCY = "agency",
    STOPS = "stops",
    ROUTES = "routes",
    CALENDAR = "calendar",
    CALENDAR_DATES = "calendar_dates",
    TRIPS = "trips",
    SHAPES = "shapes",
    FREQUENCIES = "frequencies",
    FEED_INFO = "feed_info",
    STOP_TIMES = "stop_times",
}

export const queryBuilder = (dbClient: KyselyDb, regionCode: RegionCode): Query[] => [
    {
        getQuery: () => {
            const query = dbClient
                .selectFrom(sql<Trip>`${sql.table(`trip_${regionCode}`)}`.as("trip_region"))
                .innerJoin("route", "route.id", "trip_region.route_id")
                .innerJoin("agency", "agency.id", "route.agency_id")
                .select(({ ref }) => [
                    sql<string>`concat(${sql.lit<string>(`'OP'`)}, ${ref("route.agency_id")})`.as("agency_id"),
                    "agency.name as agency_name",
                    "agency.url as agency_url",
                    sql.lit<string>(`'Europe/London'`).as("agency_timezone"),
                    sql.lit<string>(`'EN'`).as("agency_lang"),
                    "agency.phone as agency_phone",
                    "agency.noc as agency_noc",
                ])
                .distinct()
                .orderBy("agency_id asc");

            return query.compile().sql;
        },
        fileName: Files.AGENCY,
        forceQuote: ["agency_name", "agency_url", "agency_noc", "agency_phone"],
    },
    {
        getQuery: () => {
            const query = dbClient
                .with("trip_stops", (db) =>
                    db
                        .selectFrom(sql<Trip>`${sql.table(`trip_${regionCode}`)}`.as("trip_region"))
                        .innerJoin("stop_time", "stop_time.trip_id", "trip_region.id")
                        .innerJoin("stop", "stop.id", "stop_time.stop_id")
                        .select(["stop.id", "stop.parent_station"]),
                )
                .with("relevant_stop_ids", (db) =>
                    db
                        .selectFrom("trip_stops")
                        .select("id")
                        .distinct()
                        .union(
                            db
                                .selectFrom("trip_stops")
                                .select("parent_station as id")
                                .distinct()
                                .where("parent_station", "is not", null)
                                .$narrowType<{ id: NotNull }>(),
                        ),
                )
                .selectFrom("stop")
                .select([
                    "stop.id as stop_id",
                    "stop.stop_code",
                    "stop.stop_name",
                    "stop.stop_lat",
                    "stop.stop_lon",
                    "stop.wheelchair_boarding",
                    "stop.location_type",
                    "stop.parent_station",
                    "stop.platform_code",
                ])
                .innerJoin("relevant_stop_ids", "relevant_stop_ids.id", "stop.id");

            return query.compile().sql;
        },
        fileName: Files.STOPS,
        forceQuote: ["stop_name"],
    },
    {
        getQuery: () => {
            const query = dbClient
                .selectFrom(sql<Trip>`${sql.table(`trip_${regionCode}`)}`.as("trip_region"))
                .innerJoin("route", "route.id", "trip_region.route_id")
                .select(({ ref }) => [
                    "route.id as route_id",
                    sql<string>`concat(${sql.lit<string>(`'OP'`)}, ${ref("route.agency_id")})`.as("agency_id"),
                    "route.route_short_name",
                    "route.route_long_name",
                    "route.route_type",
                ])
                .distinct()
                .orderBy("route_id asc");

            return query.compile().sql;
        },
        fileName: Files.ROUTES,
        forceQuote: ["route_short_name"],
    },
    {
        getQuery: () => {
            const query = dbClient
                .selectFrom(sql<Trip>`${sql.table(`trip_${regionCode}`)}`.as("trip_region"))
                .innerJoin("calendar", "calendar.id", "trip_region.service_id")
                .select([
                    "calendar.id as service_id",
                    "calendar.monday",
                    "calendar.tuesday",
                    "calendar.wednesday",
                    "calendar.thursday",
                    "calendar.friday",
                    "calendar.saturday",
                    "calendar.sunday",
                    "calendar.start_date",
                    "calendar.end_date",
                ])
                .distinct()
                .where((eb) =>
                    eb.or([
                        eb("monday", "=", eb.lit(1)),
                        eb("tuesday", "=", eb.lit(1)),
                        eb("wednesday", "=", eb.lit(1)),
                        eb("thursday", "=", eb.lit(1)),
                        eb("friday", "=", eb.lit(1)),
                        eb("saturday", "=", eb.lit(1)),
                        eb("sunday", "=", eb.lit(1)),
                    ]),
                )
                .orderBy("service_id asc");

            return query.compile().sql;
        },
        fileName: Files.CALENDAR,
    },
    {
        getQuery: () => {
            const query = dbClient
                .selectFrom(sql<Trip>`${sql.table(`trip_${regionCode}`)}`.as("trip_region"))
                .innerJoin("calendar_date", "calendar_date.service_id", "trip_region.service_id")
                .select(["calendar_date.service_id", "calendar_date.date", "calendar_date.exception_type"])
                .distinct();

            return query.compile().sql;
        },
        fileName: Files.CALENDAR_DATES,
    },
    {
        getQuery: () => {
            const query = dbClient
                .selectFrom(sql<Trip>`${sql.table(`trip_${regionCode}`)}`.as("trip_region"))
                .select([
                    "trip_region.route_id",
                    "trip_region.service_id",
                    "trip_region.id as trip_id",
                    "trip_region.trip_headsign",
                    "trip_region.direction as direction_id",
                    "trip_region.block_id",
                    "trip_region.shape_id",
                    "trip_region.wheelchair_accessible",
                    "trip_region.vehicle_journey_code",
                ])
                .orderBy("trip_region.route_id asc");

            return query.compile().sql;
        },
        fileName: Files.TRIPS,
        forceQuote: ["trip_headsign", "vehicle_journey_code"],
    },
    {
        getQuery: () => {
            const query = dbClient
                .selectFrom(sql<Trip>`${sql.table(`trip_${regionCode}`)}`.as("trip_region"))
                .innerJoin("shape", "shape.shape_id", "trip_region.shape_id")
                .select([
                    "shape.shape_id",
                    "shape.shape_pt_lat",
                    "shape.shape_pt_lon",
                    "shape.shape_pt_sequence",
                    "shape.shape_dist_traveled",
                ])
                .distinct();

            return query.compile().sql;
        },
        fileName: Files.SHAPES,
    },
    {
        getQuery: () => {
            const query = dbClient
                .selectFrom(sql<Trip>`${sql.table(`trip_${regionCode}`)}`.as("trip_region"))
                .innerJoin("frequency", "frequency.trip_id", "trip_region.id")
                .select([
                    "frequency.trip_id",
                    "frequency.start_time",
                    "frequency.end_time",
                    "frequency.headway_secs",
                    "frequency.exact_times",
                ])
                .distinct();

            return query.compile().sql;
        },
        fileName: Files.FREQUENCIES,
    },
    {
        getQuery: () => {
            const query = dbClient
                .selectFrom(sql<Trip>`${sql.table(`trip_${regionCode}`)}`.as("trip_region"))
                .innerJoin("calendar", "calendar.id", "trip_region.service_id")
                .select(({ fn }) => [
                    sql.lit<string>(`'Bus Open Data Service (BODS)'`).as("feed_publisher_name"),
                    sql.lit<string>(`'https://www.bus-data.dft.gov.uk/'`).as("feed_publisher_url"),
                    sql.lit<string>(`'EN'`).as("feed_lang"),
                    fn.min("calendar.start_date").as("feed_start_date"),
                    fn.max("calendar.end_date").as("feed_end_date"),
                    sql.lit<string>(`'${getDate().format("YYYYMMDD_HHmmss")}'`).as("feed_version"),
                ])
                .distinct();

            return query.compile().sql;
        },
        fileName: Files.FEED_INFO,
    },
    {
        getQuery: () => {
            const query = dbClient
                .selectFrom(sql<Trip>`${sql.table(`trip_${regionCode}`)}`.as("trip_region"))
                .innerJoin("stop_time", "stop_time.trip_id", "trip_region.id")
                .select([
                    "stop_time.trip_id",
                    "stop_time.arrival_time",
                    "stop_time.departure_time",
                    "stop_time.stop_id",
                    "stop_time.stop_sequence",
                    "stop_time.stop_headsign",
                    "stop_time.pickup_type",
                    "stop_time.drop_off_type",
                    "stop_time.shape_dist_traveled",
                    "stop_time.timepoint",
                ])
                .where("stop_time.exclude", "is not", sql.lit(true))
                .distinct();

            return query.compile().sql;
        },
        fileName: Files.STOP_TIMES,
    },
];
