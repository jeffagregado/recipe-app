import type { z } from "zod";
import type { DemoStartResponse } from "../types/demo.js";
import { authSessionResponseSchema } from "./auth.schema.js";

export const demoStartResponseSchema: z.ZodType<DemoStartResponse> = authSessionResponseSchema;
