import { db } from "./index";
import { rooms, beds } from "./schema";

const ROOM_CONFIG = [
  { id: "1A", name: "ROOM 1A", capacity: 8, roomType: "mixed", floor: 1 },
  { id: "2A", name: "ROOM 2A", capacity: 8, roomType: "mixed", floor: 2 },
  { id: "3A", name: "ROOM 3A", capacity: 8, roomType: "mixed", floor: 3 },
  { id: "3B", name: "ROOM 3B", capacity: 8, roomType: "mixed", floor: 3 },
  { id: "4A", name: "ROOM 4A", capacity: 8, roomType: "mixed", floor: 4 },
  { id: "4B", name: "ROOM 4B", capacity: 8, roomType: "female", floor: 4 },
  { id: "5A", name: "ROOM 5A", capacity: 10, roomType: "mixed", floor: 5 },
];

export async function seedDatabase() {
  // Check if rooms already exist
  const existingRooms = await db.select().from(rooms);
  if (existingRooms.length > 0) {
    console.log("Database already seeded, skipping...");
    return;
  }

  console.log("Seeding database...");

  // Insert rooms
  for (const room of ROOM_CONFIG) {
    await db.insert(rooms).values(room);

    // Insert beds for this room
    for (let i = 1; i <= room.capacity; i++) {
      const bedId = `${room.id}-${String(i).padStart(2, "0")}`;
      await db.insert(beds).values({
        id: bedId,
        roomId: room.id,
        bedNumber: i,
      });
    }
  }

  console.log(
    `Seeded ${ROOM_CONFIG.length} rooms with ${ROOM_CONFIG.reduce((sum, r) => sum + r.capacity, 0)} beds`
  );
}
