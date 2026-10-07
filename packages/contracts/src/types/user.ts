import type { EntityId, ISODateString } from "./common";

export type User = {
  id: EntityId;

  name: string;
  email: string;

  imageUrl: string | null;

  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type UserSummary = Pick<User, "id" | "name" | "imageUrl">;