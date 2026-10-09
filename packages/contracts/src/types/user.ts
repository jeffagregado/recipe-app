import type { EntityId, ISODateString } from "./common.js";

export type User = {
  id: EntityId;

  name: string;

  imageUrl: string | null;

  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type UserSummary = Pick<User, "id" | "name" | "imageUrl">;