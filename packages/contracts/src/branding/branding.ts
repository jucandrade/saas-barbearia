import { z } from "zod";
import {
  AccentToneOutput,
  DisplayName,
  PrimaryToneOutput,
  ThemeInput,
  ThemeOutput,
  ToneInput,
} from "./common.js";

/** `GET /branding` and the body of every write: the barbershop identity (contracts/api.md). */
export const Branding = z.object({
  name: z.string().min(1),
  theme: ThemeOutput,
  primaryTone: PrimaryToneOutput,
  accentTone: AccentToneOutput,
  /** Public path of the logo with `?v=<version>`; `null` means no logo. */
  logoUrl: z.string().nullable(),
  /** `false` when the barbershop still has the product default (nothing saved). */
  customized: z.boolean(),
  /** ISO 8601, UTC; `null` while nothing is saved. */
  updatedAt: z.string().nullable(),
});
export type Branding = z.infer<typeof Branding>;

/** `PUT /branding` (owner). */
export const UpdateBrandingInput = z.object({
  name: DisplayName,
  theme: ThemeInput,
  primaryTone: ToneInput,
  accentTone: ToneInput,
});
export type UpdateBrandingInput = z.infer<typeof UpdateBrandingInput>;

/**
 * `GET /public/barbershops/{slug}/identity` (no login). Exactly these fields and nothing
 * else (FR-029); `name` is `null` only for the default shown for an unknown link (FR-030).
 */
export const PublicIdentity = z.object({
  name: z.string().nullable(),
  theme: ThemeOutput,
  primaryTone: PrimaryToneOutput,
  accentTone: AccentToneOutput,
  logoUrl: z.string().nullable(),
});
export type PublicIdentity = z.infer<typeof PublicIdentity>;
