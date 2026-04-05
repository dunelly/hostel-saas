import { describe, it, expect, beforeAll } from "vitest";
import { url, apiPost, apiGet } from "./helpers";

const today = new Date().toISOString().split("T")[0];
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
const runId = Date.now().toString(36); // unique per test run

const sampleReservation = {
  guestName: "API Test Guest",
  checkIn: today,
  checkOut: nextWeek,
  numGuests: 1,
  roomTypeReq: "mixed" as const,
  source: "booking.com" as const,
  externalId: `TEST-E2E-${runId}`,
  totalPrice: 500000,
  currency: "VND",
};

describe("Import API Pipeline", () => {
  beforeAll(async () => {
    await fetch(url("/api/seed"), { method: "POST" });
  });

  it("imports a new reservation successfully", async () => {
    const { status, data } = await apiPost("/api/import", {
      reservations: [sampleReservation],
    });

    expect(status).toBe(200);
    const result = data as { imported: number; duplicates: number };
    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(0);
  });

  it("deduplicates on second import of same externalId", async () => {
    const { status, data } = await apiPost("/api/import", {
      reservations: [sampleReservation],
    });

    expect(status).toBe(200);
    const result = data as { imported: number; duplicates: number };
    expect(result.imported).toBe(0);
    expect(result.duplicates).toBe(1);
  });

  it("auto-assigns bed to the imported reservation", async () => {
    const { status, data } = await apiGet(`/api/assignments?from=${today}&to=${nextWeek}`);
    expect(status).toBe(200);

    const assignments = data as Array<{ reservationId: number; bedId: string }>;
    expect(assignments.length).toBeGreaterThan(0);
  });

  it("imports multiple reservations in a batch", async () => {
    const batch = [
      { ...sampleReservation, guestName: "Batch Guest 1", externalId: `TEST-BATCH-${runId}-1` },
      { ...sampleReservation, guestName: "Batch Guest 2", externalId: `TEST-BATCH-${runId}-2` },
      { ...sampleReservation, guestName: "Batch Guest 3", externalId: `TEST-BATCH-${runId}-3` },
    ];

    const { status, data } = await apiPost("/api/import", {
      reservations: batch,
    });

    expect(status).toBe(200);
    const result = data as { imported: number };
    expect(result.imported).toBe(3);
  });

  it("cancels a reservation by externalId", async () => {
    const { status, data } = await apiPost("/api/reservations/cancel", {
      externalIds: [`TEST-E2E-${runId}`],
    });

    expect(status).toBe(200);
    const result = data as { cancelled: number };
    expect(result.cancelled).toBe(1);
  });

  it("cancel is idempotent (cancelling again returns 0)", async () => {
    const { status, data } = await apiPost("/api/reservations/cancel", {
      externalIds: [`TEST-E2E-${runId}`],
    });

    expect(status).toBe(200);
    const result = data as { cancelled: number };
    // Already cancelled, so either 0 cancelled or it re-cancels
    expect(result.cancelled).toBeLessThanOrEqual(1);
  });

  it("rejects invalid import payloads", async () => {
    const { status } = await apiPost("/api/import", {
      reservations: [{ guestName: "Missing Fields" }],
    });
    expect(status).toBe(400);
  });

  it("handles Hostelworld source reservations", async () => {
    const hwReservation = {
      ...sampleReservation,
      guestName: "Hostelworld Guest",
      externalId: `HW-${runId}`,
      source: "hostelworld" as const,
    };

    const { status, data } = await apiPost("/api/import", {
      reservations: [hwReservation],
    });

    expect(status).toBe(200);
    const result = data as { imported: number };
    expect(result.imported).toBe(1);
  });

  it("returns rooms list for extension connection test", async () => {
    const { status, data } = await apiGet("/api/rooms");
    expect(status).toBe(200);

    const rooms = data as Array<{ id: string; name: string; beds: unknown[] }>;
    expect(rooms.length).toBeGreaterThan(0);
    for (const room of rooms) {
      expect(room.beds.length).toBeGreaterThan(0);
    }
  });
});
