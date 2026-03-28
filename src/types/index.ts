export type RoomType = "mixed" | "female";
export type ReservationSource = "booking.com" | "hostelworld" | "manual";
export type ReservationStatus =
  | "confirmed"
  | "cancelled"
  | "checked_in"
  | "checked_out"
  | "no_show";

export interface ReservationImport {
  externalId: string;
  source: ReservationSource;
  guestName: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  roomTypeReq: RoomType;
  preferredRoom?: string; // e.g. "1A", "3A,3B"
  numGuests: number;
  totalPrice?: number;
  currency?: string;
  rawHtml?: string;
}

export interface GridCell {
  bedId: string;
  date: string;
  assignmentId: number | null;
  reservationId: number | null;
  guestName: string | null;
  source: ReservationSource | null;
  isManual: boolean;
}

export interface RoomWithBeds {
  id: string;
  name: string;
  capacity: number;
  roomType: RoomType;
  floor: number | null;
  beds: {
    id: string;
    bedNumber: number;
    label: string | null;
  }[];
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: string[];
  unassigned: number;
}
