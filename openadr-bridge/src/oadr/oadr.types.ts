export enum OadrSignalName {
  SIMPLE = 'SIMPLE',
  PRICE = 'price',
  LOAD_DISPATCH = 'LOAD_DISPATCH',
  ELECTRICITY_PRICE = 'ELECTRICITY_PRICE',
}

export enum OadrEventStatus {
  NONE = 'none',
  FAR = 'far',
  NEAR = 'near',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface DrEvent {
  eventID: string;
  modificationNumber: number;
  eventStatus: OadrEventStatus;
  dtstart: string;     // ISO 8601 datetime
  duration: string;    // ISO 8601 duration e.g. PT1H
  signalName: OadrSignalName;
  signalLevel: number; // 0=normal 1=low 2=high 3=special (for SIMPLE signal)
  testEvent: boolean;
  vtnComment?: string;
  receivedAt: string;
}

export interface DrReport {
  venID: string;
  reportID: string;
  reportSpecifierID: string;
  reportName: string;
  dtstart: string;      // ISO 8601 datetime
  duration: string;     // ISO 8601 duration
  intervals: Array<{
    dtstart: string;
    duration: string;
    value: number;
    rid?: string;
  }>;
  receivedAt: string;
}

export interface ParsedOadrMessage {
  type:
    | 'oadrDistributeEvent'
    | 'oadrRequestEvent'
    | 'oadrCreatedEvent'
    | 'oadrUpdateReport'
    | 'oadrRegisterReport'
    | 'oadrPoll'
    | 'unknown';
  raw: any;
}
