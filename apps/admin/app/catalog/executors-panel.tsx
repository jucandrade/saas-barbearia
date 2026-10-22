"use client";

import { useEffect, useState } from "react";
import {
  Executor,
  ExecutorsOutput,
  type Service,
  type User,
} from "@barbearia/contracts";
import { call, callWithoutResponse } from "../../lib/api";
import { messageOf } from "./errors";

interface Props {
  service: Service;
  /** Active people of the team who may perform services (barbers and owners). */
  people: User[];
  /** Called after any change, so the list can refresh its "sem executor" mark. */
  onChanged: () => void;
}

/** Who performs a service: one checkbox per active person of the team. */
export function ExecutorsPanel({ service, people, onChanged }: Props) {
  const [executors, setExecutors] = useState<Executor[] | undefined>();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    call(`/services/${service.id}/executors`, { schema: ExecutorsOutput })
      .then((response) => {
        if (active) setExecutors(response.executors);
      })
      .catch((failure: unknown) => {
        if (active) setError(messageOf(failure));
      });
    return () => {
      active = false;
    };
  }, [service.id, version]);

  async function toggle(person: User, linked: boolean) {
    setError(undefined);
    setBusy(true);
    try {
      if (linked) {
        await callWithoutResponse(
          `/services/${service.id}/executors/${person.id}`,
          undefined,
          "DELETE",
        );
      } else {
        await call(`/services/${service.id}/executors/${person.id}`, {
          method: "PUT",
          body: {},
          schema: Executor,
        });
      }
      setVersion((v) => v + 1);
      onChanged();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  if (executors === undefined) {
    return <p role="status">Carregando…</p>;
  }
  const linkedIds = new Set(executors.map((e) => e.userId));
  return (
    <fieldset className="executors">
      <legend>Quem executa</legend>
      {people.length === 0 && (
        <p className="hint">Nenhuma pessoa ativa na equipe.</p>
      )}
      {people.map((person) => {
        const linked = linkedIds.has(person.id);
        return (
          <label key={person.id} className="check">
            <input
              type="checkbox"
              checked={linked}
              disabled={busy}
              onChange={() => {
                void toggle(person, linked);
              }}
            />
            {person.name}
            {person.role === "owner" ? " (dono)" : ""}
          </label>
        );
      })}
      {error !== undefined && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
