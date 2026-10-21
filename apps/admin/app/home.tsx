"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MeOutput } from "@barbearia/contracts";
import { call, ApiResponseError } from "../lib/api";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; me: MeOutput };

/** Entry point: owners go to Team; everyone else sees a notice. */
export function Home() {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let active = true;
    call("/auth/me", { schema: MeOutput })
      .then((me) => {
        if (!active) return;
        if (me.user.role === "owner") {
          router.replace("/team");
          return;
        }
        setState({ phase: "ready", me });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiResponseError && error.status === 401) {
          router.replace("/sign-in");
          return;
        }
        setState({
          phase: "error",
          message:
            error instanceof Error
              ? error.message
              : "Algo deu errado. Tente de novo.",
        });
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (state.phase === "loading") {
    return <p role="status">Carregando…</p>;
  }
  if (state.phase === "error") {
    return <p role="alert">{state.message}</p>;
  }
  const { user, barbershop } = state.me;
  return (
    <>
      <h1>{barbershop.name}</h1>
      <p>
        Olá, {user.name}. A gestão da barbearia fica com os donos; use o app do
        barbeiro no celular.
      </p>
      <div className="card">
        {barbershop.units.map((unit) => (
          <p key={unit.id}>
            Unidade <strong>{unit.name}</strong> · fuso {unit.timezone}
          </p>
        ))}
      </div>
    </>
  );
}
