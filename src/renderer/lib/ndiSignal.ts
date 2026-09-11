export interface SignalPayload {
  role: "phone" | "producer";
  type: "offer" | "answer" | "ice" | "hangup";
  payload?: RTCSessionDescriptionInit | RTCIceCandidateInit | null;
}

export interface RoomState {
  offer: RTCSessionDescriptionInit | null;
  answer: RTCSessionDescriptionInit | null;
  phoneIce: RTCIceCandidateInit[];
  producerIce: RTCIceCandidateInit[];
  updatedAt: number;
}

const g = globalThis as typeof globalThis & { __watchinNdiRooms?: Map<string, RoomState> };
if (!g.__watchinNdiRooms) g.__watchinNdiRooms = new Map();
const rooms = g.__watchinNdiRooms;

function emptyRoom(): RoomState {
  return { offer: null, answer: null, phoneIce: [], producerIce: [], updatedAt: Date.now() };
}

export function getRoom(id: string) {
  prune();
  return rooms.get(id) ?? emptyRoom();
}

export function postRoom(id: string, body: SignalPayload) {
  prune();
  const room = rooms.get(id) ?? emptyRoom();
  if (body.type === "hangup") {
    rooms.delete(id);
    return emptyRoom();
  }
  if (body.type === "offer" && body.payload && "type" in body.payload) {
    room.offer = body.payload;
    room.answer = null;
    room.phoneIce = [];
    room.producerIce = [];
  }
  if (body.type === "answer" && body.payload && "type" in body.payload) {
    room.answer = body.payload;
  }
  if (body.type === "ice" && body.payload && "candidate" in body.payload) {
    const list = body.role === "phone" ? room.phoneIce : room.producerIce;
    list.push(body.payload);
  }
  room.updatedAt = Date.now();
  rooms.set(id, room);
  return room;
}

function prune() {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, room] of rooms) {
    if (room.updatedAt < cutoff) rooms.delete(id);
  }
}
