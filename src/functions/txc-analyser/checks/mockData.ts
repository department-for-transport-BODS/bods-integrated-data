import { TxcSchema } from "@bods-integrated-data/shared/schema";
import { DynamoDbObservation, NaptanStopMap } from "@bods-integrated-data/shared/txc-analysis/schema";
import { PartialDeep } from "type-fest";

export const mockValidData: PartialDeep<TxcSchema> = {
    TransXChange: {
        "@_RevisionNumber": "1",
        Operators: {
            Operator: [
                {
                    NationalOperatorCode: "NOC123",
                    OperatorCode: "OP123",
                    OperatorShortName: "Operator 123",
                    "@_id": "1",
                },
            ],
        },
        RouteSections: {
            RouteSection: [
                {
                    "@_id": "RS1",
                    RouteLink: [
                        {
                            Track: [
                                {
                                    Mapping: {
                                        Location: [
                                            {
                                                Latitude: 51.123,
                                                Longitude: -1.123,
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        Routes: {
            Route: [
                {
                    "@_id": "R1",
                    RouteSectionRef: ["RS1"],
                },
            ],
        },
        JourneyPatternSections: {
            JourneyPatternSection: [
                {
                    "@_id": "JPS1",
                    JourneyPatternTimingLink: [
                        {
                            "@_id": "JPTL1",
                            From: {
                                Activity: "pickUp",
                                StopPointRef: "SP1",
                                TimingStatus: "PTP",
                                WaitTime: "00:02",
                            },
                            To: {
                                Activity: "pickUpAndSetDown",
                                StopPointRef: "SP2",
                                TimingStatus: "OTH",
                                WaitTime: "PT0M0S",
                            },
                            RunTime: "PT0M0S",
                        },
                        {
                            "@_id": "JPTL1",
                            From: {
                                Activity: "pickUpAndSetDown",
                                StopPointRef: "SP2",
                                TimingStatus: "OTH",
                                WaitTime: "PT0M0S",
                            },
                            To: {
                                Activity: "pickUpAndSetDown",
                                StopPointRef: "SP3",
                                TimingStatus: "OTH",
                                WaitTime: "PT5M0S",
                            },
                            RunTime: "PT5M0S",
                        },
                    ],
                },
                {
                    "@_id": "JPS2",
                    JourneyPatternTimingLink: [
                        {
                            "@_id": "JPTL2",
                            From: {
                                Activity: "pickUpAndSetDown",
                                StopPointRef: "SP3",
                                TimingStatus: "OTH",
                                WaitTime: "PT5M0S",
                            },
                            To: {
                                Activity: "setDown",
                                StopPointRef: "SP4",
                                TimingStatus: "PTP",
                            },
                            RunTime: "PT10M0S",
                        },
                    ],
                },
            ],
        },
        ServicedOrganisations: {
            ServicedOrganisation: [
                {
                    OrganisationCode: "ORG1",
                    WorkingDays: {
                        DateRange: [{ EndDate: "2023-01-01" }, { EndDate: "2023-12-31" }],
                    },
                    Holidays: {
                        DateRange: [{ EndDate: "2023-12-25" }, { EndDate: "2023-12-26" }],
                    },
                },
            ],
        },
        Services: {
            Service: [
                {
                    ServiceCode: "SVC1",
                    OperatingPeriod: {
                        StartDate: "2023-01-01",
                        EndDate: "2023-12-31",
                    },
                    Lines: {
                        Line: [
                            {
                                "@_id": "L1",
                                LineName: "Line 1",
                            },
                        ],
                    },
                    Mode: "bus",
                    RegisteredOperatorRef: "OP123",
                    StandardService: {
                        JourneyPattern: [
                            {
                                "@_id": "JP1",
                                DestinationDisplay: "Central Station",
                                RouteRef: "R1",
                                JourneyPatternSectionRefs: ["JPS1", "JPS2"],
                                Direction: "outbound",
                            },
                        ],
                    },
                },
            ],
        },
        VehicleJourneys: {
            VehicleJourney: [
                {
                    "@_RevisionNumber": "1",
                    VehicleJourneyCode: "VJ12345",
                    DepartureTime: "08:00:00",
                    DestinationDisplay: "Central Station",
                    Frequency: {
                        EndTime: "18:00",
                        Interval: {
                            ScheduledFrequency: "15",
                        },
                    },
                    Operational: {
                        Block: {
                            BlockNumber: "B123",
                        },
                        TicketMachine: {
                            TicketMachineServiceCode: "TM123",
                            JourneyCode: "JC123",
                        },
                        VehicleType: {
                            WheelchairAccessible: true,
                            VehicleEquipment: {
                                WheelchairEquipment: {
                                    NumberOfWheelchairAreas: 2,
                                },
                            },
                        },
                    },
                    ServiceRef: "SVC1",
                    LineRef: "L1",
                    JourneyPatternRef: "JP1",
                    VehicleJourneyRef: "VJR123",
                    VehicleJourneyTimingLink: [
                        {
                            "@_id": "VJTL123",
                            JourneyPatternTimingLinkRef: "JPTL1",
                            From: {
                                Activity: "pickUp",
                                StopPointRef: "SP1",
                                TimingStatus: "scheduled",
                                WaitTime: "00:02",
                            },
                            To: {
                                Activity: "dropOff",
                                StopPointRef: "SP2",
                                TimingStatus: "scheduled",
                                WaitTime: "00:03",
                            },
                            RunTime: "00:10",
                        },
                    ],
                },
            ],
        },
        StopPoints: {
            AnnotatedStopPointRef: [
                {
                    StopPointRef: "SP1",
                    CommonName: "Stop 1",
                    Location: {
                        Latitude: 51.123,
                        Longitude: -1.123,
                    },
                },
                {
                    StopPointRef: "SP2",
                    CommonName: "Stop 2",
                    Location: {
                        Latitude: 51.123,
                        Longitude: -1.123,
                    },
                },
                {
                    StopPointRef: "Sp4",
                    CommonName: "Stop 4",
                    Location: {
                        Latitude: 51.123,
                        Longitude: -1.123,
                    },
                },
            ],
            StopPoint: [
                {
                    AtcoCode: "ATCO1",
                    Descriptor: {
                        CommonName: "Stop 1",
                    },
                    Place: {
                        Location: {
                            Latitude: 51.123,
                            Longitude: -1.123,
                        },
                    },
                },
                {
                    AtcoCode: "ATCO2",
                    Descriptor: {
                        CommonName: "Stop 2",
                    },
                    Place: {
                        Location: {
                            Latitude: 51.123,
                            Longitude: -1.123,
                        },
                    },
                },
            ],
        },
    },
} as unknown as PartialDeep<TxcSchema>;

export const mockInvalidData: PartialDeep<TxcSchema> = {
    TransXChange: {
        "@_RevisionNumber": "1",
        Operators: {
            Operator: [
                {
                    NationalOperatorCode: "NOC123",
                    OperatorCode: "OP123",
                    OperatorShortName: "Operator 123",
                    "@_id": "1",
                },
            ],
        },
        RouteSections: {
            RouteSection: [
                {
                    "@_id": "RS1",
                    RouteLink: [
                        {
                            Track: [
                                {
                                    Mapping: {
                                        Location: [
                                            {
                                                Latitude: 51.123,
                                                Longitude: -1.123,
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        Routes: {
            Route: [
                {
                    "@_id": "R1",
                    RouteSectionRef: ["RS1"],
                },
            ],
        },
        JourneyPatternSections: {
            JourneyPatternSection: [
                {
                    "@_id": "JPS1",
                    JourneyPatternTimingLink: [
                        {
                            "@_id": "JPTL1",
                            From: {
                                Activity: "setDown",
                                StopPointRef: "SP1",
                                TimingStatus: "wrong",
                                WaitTime: "00:02",
                            },
                            To: {
                                Activity: "pickUpAndSetDown",
                                StopPointRef: "SP11",
                                TimingStatus: "wrong",
                                WaitTime: "00:03",
                            },
                            RunTime: "00:10",
                        },
                    ],
                },
                {
                    "@_id": "JPS2",
                    JourneyPatternTimingLink: [
                        {
                            "@_id": "JPTL2",
                            From: {
                                Activity: "pickUpAndSetDown",
                                StopPointRef: "SP3",
                                TimingStatus: "wrong",
                                WaitTime: "00:01",
                            },
                            To: {
                                Activity: "pickUp",
                                StopPointRef: "SP2",
                                TimingStatus: "wrong",
                                WaitTime: "00:02",
                            },
                            RunTime: "00:08",
                        },
                    ],
                },
            ],
        },
        ServicedOrganisations: {
            ServicedOrganisation: [
                {
                    OrganisationCode: "ORG1",
                    WorkingDays: {
                        DateRange: [{ EndDate: "2023-01-01" }, { EndDate: "2023-12-31" }],
                    },
                    Holidays: {
                        DateRange: [{ EndDate: "2023-12-25" }, { EndDate: "2023-12-26" }],
                    },
                },
            ],
        },
        Services: {
            Service: [
                {
                    ServiceCode: "SVC1",
                    OperatingPeriod: {
                        StartDate: "2023-01-01",
                        EndDate: "2023-12-31",
                    },
                    Lines: {
                        Line: [
                            {
                                "@_id": "L1",
                                LineName: "Line 1",
                            },
                        ],
                    },
                    Mode: "bus",
                    RegisteredOperatorRef: "OP123",
                    StandardService: {
                        JourneyPattern: [
                            {
                                "@_id": "JP1",
                                DestinationDisplay: "Central Station",
                                RouteRef: "R1",
                                JourneyPatternSectionRefs: ["JPS1", "JPS2"],
                                Direction: "outbound",
                            },
                        ],
                    },
                },
            ],
        },
        VehicleJourneys: {
            VehicleJourney: [
                {
                    "@_RevisionNumber": "1",
                    VehicleJourneyCode: "VJ12345",
                    DepartureTime: "08:00:00",
                    DestinationDisplay: "Central Station",
                    Frequency: {
                        EndTime: "18:00",
                        Interval: {
                            ScheduledFrequency: "15",
                        },
                    },
                    Operational: {
                        TicketMachine: {
                            TicketMachineServiceCode: "TM123",
                            JourneyCode: "JC123",
                        },
                        VehicleType: {
                            WheelchairAccessible: true,
                            VehicleEquipment: {
                                WheelchairEquipment: {
                                    NumberOfWheelchairAreas: 2,
                                },
                            },
                        },
                    },
                    ServiceRef: "SVC1",
                    LineRef: "L1",
                    JourneyPatternRef: "JP1",
                    VehicleJourneyRef: "VJR123",
                    VehicleJourneyTimingLink: [
                        {
                            "@_id": "VJTL123",
                            JourneyPatternTimingLinkRef: "JPTL1",
                            From: {
                                Activity: "pickUp",
                                StopPointRef: "SP1",
                                TimingStatus: "scheduled",
                                WaitTime: "00:02",
                            },
                            To: {
                                Activity: "dropOff",
                                StopPointRef: "SP2",
                                TimingStatus: "scheduled",
                                WaitTime: "00:03",
                            },
                            RunTime: "00:10",
                        },
                    ],
                },
            ],
        },
        StopPoints: {
            AnnotatedStopPointRef: [
                {
                    StopPointRef: "SP1",
                    CommonName: "Stop 1",
                    Location: {
                        Latitude: 51.123,
                        Longitude: -1.123,
                    },
                },
                {
                    StopPointRef: "SP2",
                    CommonName: "Stop 2",
                    Location: {
                        Latitude: 51.123,
                        Longitude: -1.123,
                    },
                },
            ],
            StopPoint: [
                {
                    AtcoCode: "ATCO1",
                    Descriptor: {
                        CommonName: "Stop 1",
                    },
                    Place: {
                        Location: {
                            Latitude: 51.123,
                            Longitude: -1.123,
                        },
                    },
                },
                {
                    AtcoCode: "ATCO2",
                    Descriptor: {
                        CommonName: "Stop 2",
                    },
                    Place: {
                        Location: {
                            Latitude: 51.123,
                            Longitude: -1.123,
                        },
                    },
                },
            ],
        },
    },
} as unknown as PartialDeep<TxcSchema>;

export const mockTxcXml = `
<TransXChange>
  <StopPoints>
    <AnnotatedStopPointRef>
      <StopPointRef>SP1</StopPointRef>
      <CommonName>Stop 1</CommonName>
    </AnnotatedStopPointRef>
    <AnnotatedStopPointRef>
      <StopPointRef>SP2</StopPointRef>
      <CommonName>Stop 2</CommonName>
    </AnnotatedStopPointRef>
    <AnnotatedStopPointRef>
      <StopPointRef>SP3</StopPointRef>
      <CommonName>Stop 3</CommonName>
    </AnnotatedStopPointRef>
  </StopPoints>
  <Routes>
    <Route id="R1">
      <RouteSectionRef>RS1</RouteSectionRef>
    </Route>
  </Routes>
  <JourneyPatternSections>
    <JourneyPatternSection id="JPS1">
      <JourneyPatternTimingLink id="JPTL1">
        <From>
        <Activity>setDown</Activity>
          <StopPointRef>SP1</StopPointRef>
          <TimingStatus>PTP</TimingStatus>
        </From>
        <To>
        <Activity>pickUp</Activity>
          <StopPointRef>SP2</StopPointRef>
          <TimingStatus>PTP</TimingStatus>
        </To>
        <RunTime>PT2M0S</RunTime>
      </JourneyPatternTimingLink>
    </JourneyPatternSection>
  </JourneyPatternSections>
  <Operators>
    <Operator id="O1">
      <NationalOperatorCode>ABCD</NationalOperatorCode>
      <OperatorCode>ABCD-fallback</OperatorCode>
      <OperatorShortName>Operator O1</OperatorShortName>
    </Operator>
  </Operators>
  <Services>
    <Service>
      <RegisteredOperatorRef>O1</RegisteredOperatorRef>
      <ServiceCode>S1</ServiceCode>
      <Lines>
        <Line id="ABCD:S1:L1">
          <LineName>L1</LineName>
        </Line>
      </Lines>
      <OperatingPeriod>
        <StartDate>2025-01-16</StartDate>
      </OperatingPeriod>
      <StandardService>
        <JourneyPattern id="JP1">
          <Direction>outbound</Direction>
          <RouteRef>R1</RouteRef>
          <JourneyPatternSectionRefs>JPS1</JourneyPatternSectionRefs>
        </JourneyPattern>
      </StandardService>
    </Service>
  </Services>
  <VehicleJourneys>
    <VehicleJourney>
      <Operational>
        <Block>
          <BlockNumber>1</BlockNumber>
        </Block>
        <TicketMachine>
          <TicketMachineServiceCode>L1</TicketMachineServiceCode>
          <JourneyCode>J1</JourneyCode>
        </TicketMachine>
      </Operational>
      <OperatingProfile>
        <RegularDayType>
          <DaysOfWeek>
            <Monday />
            <Tuesday />
          </DaysOfWeek>
        </RegularDayType>
      </OperatingProfile>
      <VehicleJourneyCode>VJ1</VehicleJourneyCode>
      <ServiceRef>S1</ServiceRef>
      <LineRef>ABCD:S1:L1</LineRef>
      <JourneyPatternRef>JP1</JourneyPatternRef>
      <DepartureTime>23:30:00</DepartureTime>
    </VehicleJourney>
    <VehicleJourney>
      <Operational>
        <Block>
          <BlockNumber>2</BlockNumber>
        </Block>
        <TicketMachine>
          <TicketMachineServiceCode>L1</TicketMachineServiceCode>
          <JourneyCode>J2</JourneyCode>
        </TicketMachine>
      </Operational>
      <OperatingProfile>
        <RegularDayType>
          <DaysOfWeek>
            <Monday />
            <Tuesday />
          </DaysOfWeek>
        </RegularDayType>
      </OperatingProfile>
      <VehicleJourneyCode>VJ2</VehicleJourneyCode>
      <ServiceRef>S1</ServiceRef>
      <LineRef>ABCD:S1:L1</LineRef>
      <JourneyPatternRef>JP1</JourneyPatternRef>
      <DepartureTime>00:30:00</DepartureTime>
    </VehicleJourney>
  </VehicleJourneys>
</TransXChange>
`;

export const mockTxcXmlParsed: PartialDeep<TxcSchema> = {
    TransXChange: {
        StopPoints: {
            AnnotatedStopPointRef: [
                { StopPointRef: "SP1", CommonName: "Stop 1" },
                { StopPointRef: "SP2", CommonName: "Stop 2" },
                { StopPointRef: "SP3", CommonName: "Stop 3" },
            ],
        },
        Routes: {
            Route: [
                {
                    "@_id": "R1",
                    RouteSectionRef: ["RS1"],
                },
            ],
        },
        JourneyPatternSections: {
            JourneyPatternSection: [
                {
                    "@_id": "JPS1",
                    JourneyPatternTimingLink: [
                        {
                            "@_id": "JPTL1",

                            From: { Activity: "setDown", StopPointRef: "SP1", TimingStatus: "PTP" },
                            To: { Activity: "pickUp", StopPointRef: "SP2", TimingStatus: "PTP" },
                            RunTime: "PT2M0S",
                        },
                    ],
                },
            ],
        },
        Operators: {
            Operator: [
                {
                    "@_id": "O1",
                    NationalOperatorCode: "ABCD",
                    OperatorCode: "ABCD-fallback",
                    OperatorShortName: "Operator O1",
                },
            ],
        },
        Services: {
            Service: [
                {
                    RegisteredOperatorRef: "O1",
                    ServiceCode: "S1",
                    Lines: {
                        Line: [
                            {
                                "@_id": "ABCD:S1:L1",
                                LineName: "L1",
                            },
                        ],
                    },
                    OperatingPeriod: {
                        StartDate: "2025-01-16",
                    },
                    StandardService: {
                        JourneyPattern: [
                            {
                                "@_id": "JP1",
                                Direction: "outbound",
                                RouteRef: "R1",
                                JourneyPatternSectionRefs: ["JPS1"],
                            },
                        ],
                    },
                },
            ],
        },
        VehicleJourneys: {
            VehicleJourney: [
                {
                    Operational: {
                        Block: { BlockNumber: "1" },
                        TicketMachine: {
                            TicketMachineServiceCode: "L1",
                            JourneyCode: "J1",
                        },
                    },
                    OperatingProfile: {
                        RegularDayType: {
                            DaysOfWeek: {
                                Monday: "",
                                Tuesday: "",
                            },
                        },
                    },
                    VehicleJourneyCode: "VJ1",
                    ServiceRef: "S1",
                    LineRef: "ABCD:S1:L1",
                    JourneyPatternRef: "JP1",
                    DepartureTime: "23:30:00",
                },
                {
                    Operational: {
                        Block: { BlockNumber: "2" },
                        TicketMachine: {
                            TicketMachineServiceCode: "L1",
                            JourneyCode: "J2",
                        },
                    },
                    OperatingProfile: {
                        RegularDayType: {
                            DaysOfWeek: {
                                Monday: "",
                                Tuesday: "",
                            },
                        },
                    },
                    VehicleJourneyCode: "VJ2",
                    ServiceRef: "S1",
                    LineRef: "ABCD:S1:L1",
                    JourneyPatternRef: "JP1",
                    DepartureTime: "00:30:00",
                },
            ],
        },
    },
};

export const mockNaptanStopsCsv = `ATCOCode,NaptanCode,PlateCode,CleardownCode,CommonName,CommonNameLang,ShortCommonName,ShortCommonNameLang,Landmark,LandmarkLang,Street,StreetLang,Crossing,CrossingLang,Indicator,IndicatorLang,Bearing,NptgLocalityCode,LocalityName,ParentLocalityName,GrandParentLocalityName,Town,TownLang,Suburb,SuburbLang,LocalityCentre,GridType,Easting,Northing,Longitude,Latitude,StopType,BusStopType,TimingStatus,DefaultWaitTime,Notes,NotesLang,AdministrativeAreaCode,CreationDateTime,ModificationDateTime,RevisionNumber,Modification,Status
SP1,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,ABC,,,,,,A1,,,,,
SP2,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,A2,,,,,
SP3,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
`;

export const mockNptgXml = `
<NationalPublicTransportGazetteer>
    <Regions>
        <Region>
            <RegionCode>NW</RegionCode>
            <AdministrativeAreas>
                <AdministrativeArea>
                    <AdministrativeAreaCode>A1</AdministrativeAreaCode>
                </AdministrativeArea>
                <AdministrativeArea>
                    <AdministrativeAreaCode>A2</AdministrativeAreaCode>
                </AdministrativeArea>
            </AdministrativeAreas>
        </Region>
        <Region>
            <RegionCode>SE</RegionCode>
            <AdministrativeAreas>
                <AdministrativeArea>
                    <AdministrativeAreaCode>A1</AdministrativeAreaCode>
                </AdministrativeArea>
            </AdministrativeAreas>
        </Region>
    </Regions>
</NationalPublicTransportGazetteer>
`;

export const mockNaptanStopMap: NaptanStopMap = {
    SP1: {
        stopType: "ABC",
        regions: ["NW", "SE"],
    },
    SP2: {
        stopType: null,
        regions: ["NW"],
    },
    SP3: {
        stopType: null,
        regions: [],
    },
};

export const mockDynamoDbObservations: DynamoDbObservation[] = [
    {
        PK: "test-file.xml",
        SK: "0",
        noc: "ABCD",
        region: "NW;SE",
        dataSource: "unknown",
        importance: "critical",
        category: "stop",
        observation: "First stop is set down only",
        serviceCode: "S1",
        lineName: "L1",
        latestEndDate: "n/a",
        details: "The first stop (Stop 1) on the 23:30:00 outbound journey is incorrectly set to set down passengers.",
        extraColumns: {
            "Stop Name": "Stop 1",
            "Departure time": "23:30:00",
            Direction: "outbound",
        },
    },
    {
        PK: "test-file.xml",
        SK: "1",
        noc: "ABCD",
        region: "NW;SE",
        dataSource: "unknown",
        importance: "critical",
        category: "stop",
        observation: "Last stop is pick up only",
        serviceCode: "S1",
        lineName: "L1",
        latestEndDate: "n/a",
        details: "The last stop (Stop 2) on the 23:30:00 outbound journey is incorrectly set to pick up passengers.",
        extraColumns: {
            "Stop Name": "Stop 2",
            "Departure time": "23:30:00",
            Direction: "outbound",
        },
    },
    {
        PK: "test-file.xml",
        SK: "2",
        noc: "ABCD",
        region: "NW;SE",
        dataSource: "unknown",
        importance: "critical",
        category: "stop",
        observation: "First stop is set down only",
        serviceCode: "S1",
        lineName: "L1",
        latestEndDate: "n/a",
        details: "The first stop (Stop 1) on the 00:30:00 outbound journey is incorrectly set to set down passengers.",
        extraColumns: {
            "Stop Name": "Stop 1",
            "Departure time": "00:30:00",
            Direction: "outbound",
        },
    },
    {
        PK: "test-file.xml",
        SK: "3",
        noc: "ABCD",
        region: "NW;SE",
        dataSource: "unknown",
        importance: "critical",
        category: "stop",
        observation: "Last stop is pick up only",
        serviceCode: "S1",
        lineName: "L1",
        latestEndDate: "n/a",
        details: "The last stop (Stop 2) on the 00:30:00 outbound journey is incorrectly set to pick up passengers.",
        extraColumns: {
            "Stop Name": "Stop 2",
            "Departure time": "00:30:00",
            Direction: "outbound",
        },
    },
    {
        PK: "test-file.xml",
        SK: "4",
        noc: "ABCD",
        region: "NW;SE",
        dataSource: "unknown",
        serviceCode: "n/a",
        lineName: "n/a",
        latestEndDate: "n/a",
        observation: "Incorrect stop type",
        category: "stop",
        importance: "critical",
        details:
            "The Stop 1 (SP1) stop is registered as stop type ABC with NaPTAN. Expected bus stop types are BCT,BCQ,BCS,BCE,BST.",
        extraColumns: { "Stop Name": "Stop 1", "Stop Point Ref": "SP1" },
    },
];
