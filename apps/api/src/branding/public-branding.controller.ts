import { createHash } from "node:crypto";
import {
  Controller,
  Get,
  Headers,
  Param,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Public } from "../identity/auth/decorators.js";
import { ApiError } from "../identity/http/api-error.js";
import { PublicBrandingService } from "./public-branding.service.js";

/** The slice of the Express response used here, so the code does not depend on its types. */
interface Reply {
  status(code: number): Reply;
  setHeader(name: string, value: string): unknown;
  end(body?: string | Buffer): unknown;
}

/** True when the `If-None-Match` header names the current entity tag. */
function isCurrent(header: string | undefined, etag: string): boolean {
  return (
    header !== undefined &&
    header.split(",").some((candidate) => {
      const tag = candidate.trim();
      return tag === "*" || tag === etag || tag === `W/${etag}`;
    })
  );
}

/**
 * Read-only identity of a barbershop for its public link, no login (FR-029, FR-030). The
 * barbershop is named only by the slug of the link. Rate limited per origin, like the other
 * public routes, so slugs cannot be swept.
 */
@Public()
@UseGuards(ThrottlerGuard)
@Controller("public/barbershops")
export class PublicBrandingController {
  constructor(private readonly publicBranding: PublicBrandingService) {}

  // Always revalidated (cheap 304): a change by the owner must show on the next visit (FR-012).
  @Get(":slug/identity")
  async identity(
    @Param("slug") slug: string,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res() res: Reply,
  ): Promise<void> {
    const body = JSON.stringify(await this.publicBranding.identity(slug));
    const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "no-cache");
    if (isCurrent(ifNoneMatch, etag)) {
      res.status(304).end();
      return;
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).end(body);
  }

  // The version is in the url, so the image never changes under it: cache for good.
  @Get(":slug/logo")
  async logo(
    @Param("slug") slug: string,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res() res: Reply,
  ): Promise<void> {
    const logo = await this.publicBranding.logo(slug);
    if (logo === undefined) {
      // An unknown link and a missing logo look the same.
      throw new ApiError(404, "NOT_FOUND", "Recurso não encontrado.");
    }
    const etag = `"${logo.version}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    // The bytes are user content: served as the detected type only, never sniffed, never run.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Content-Disposition", "inline");
    if (isCurrent(ifNoneMatch, etag)) {
      res.status(304).end();
      return;
    }
    res.setHeader("Content-Type", logo.contentType);
    res.status(200).end(logo.content);
  }
}
