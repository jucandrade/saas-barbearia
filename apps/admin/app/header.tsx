"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MeOutput } from "@barbearia/contracts";
import { call, callWithoutResponse } from "../lib/api";
import { useBrand } from "./branding/branding-provider";

/** Admin header: shows who is signed in and the sign-out button. */
export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { logoSrc } = useBrand();
  const [me, setMe] = useState<MeOutput | undefined>();

  // Queries again on every page change: the layout is not remounted after signing in.
  useEffect(() => {
    let active = true;
    call("/auth/me", { schema: MeOutput })
      .then((response) => {
        if (active) setMe(response);
      })
      .catch(() => {
        if (active) setMe(undefined);
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  async function signOut() {
    try {
      await callWithoutResponse("/auth/logout");
    } finally {
      setMe(undefined);
      router.replace("/sign-in");
    }
  }

  if (me === undefined) {
    return null;
  }
  return (
    <header className="header">
      <span className="brand">
        {logoSrc !== null && (
          // eslint-disable-next-line @next/next/no-img-element -- the API serves the logo already sized and cached
          <img className="brand-logo" src={logoSrc} alt="" />
        )}
        <span>
          <strong>{me.barbershop.name}</strong> · {me.user.name}
        </span>
      </span>
      {me.user.role === "owner" && (
        <nav className="nav" aria-label="Principal">
          <Link
            href="/team"
            aria-current={pathname === "/team" ? "page" : undefined}
          >
            Equipe
          </Link>
          <Link
            href="/catalog"
            aria-current={pathname === "/catalog" ? "page" : undefined}
          >
            Catálogo
          </Link>
          <Link
            href="/branding"
            aria-current={pathname === "/branding" ? "page" : undefined}
          >
            Identidade visual
          </Link>
        </nav>
      )}
      <button
        type="button"
        className="secondary"
        onClick={() => void signOut()}
      >
        Sair
      </button>
    </header>
  );
}
