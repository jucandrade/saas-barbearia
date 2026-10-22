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
import { formatPrice, parsePrice, priceToInput } from "./money";

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
  return (
    <fieldset className="executors">
      <legend>Quem executa</legend>
      {people.length === 0 && (
        <p className="hint">Nenhuma pessoa ativa na equipe.</p>
      )}
      {people.map((person) => {
        const link = executors.find((e) => e.userId === person.id);
        const linked = link !== undefined;
        return (
          <div key={person.id}>
            <label className="check">
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
            {link !== undefined && (
              <SpecificValues
                service={service}
                link={link}
                onSaved={() => {
                  setVersion((v) => v + 1);
                  onChanged();
                }}
              />
            )}
          </div>
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

interface ValuesProps {
  service: Service;
  link: Executor;
  onSaved: () => void;
}

/** Optional specific price and duration of one executor; blank means "use the service's". */
function SpecificValues({ service, link, onSaved }: ValuesProps) {
  const [price, setPrice] = useState(
    link.priceCents == null ? "" : priceToInput(link.priceCents),
  );
  const [duration, setDuration] = useState(
    link.durationMinutes == null ? "" : String(link.durationMinutes),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const shownPrice = link.priceCents ?? service.priceCents;
  const shownDuration = link.durationMinutes ?? service.durationMinutes;

  async function save() {
    setError(undefined);
    const priceCents = price.trim() === "" ? null : parsePrice(price);
    if (priceCents === undefined) {
      setError("Informe o preço em reais, por exemplo 60,00.");
      return;
    }
    setBusy(true);
    try {
      await call(`/services/${service.id}/executors/${link.userId}`, {
        method: "PUT",
        body: {
          priceCents,
          durationMinutes: duration.trim() === "" ? null : Number(duration),
        },
        schema: Executor,
      });
      onSaved();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="values">
      <p className="hint">
        Vale para {link.name}: {formatPrice(shownPrice)} ·{" "}
        {String(shownDuration)} min
      </p>
      <label htmlFor={`${service.id}-${link.userId}-price`}>
        Preço próprio (R$)
      </label>
      <input
        id={`${service.id}-${link.userId}-price`}
        inputMode="decimal"
        value={price}
        placeholder={priceToInput(service.priceCents)}
        onChange={(e) => {
          setPrice(e.target.value);
        }}
        autoComplete="off"
      />
      <label htmlFor={`${service.id}-${link.userId}-duration`}>
        Duração própria (minutos)
      </label>
      <input
        id={`${service.id}-${link.userId}-duration`}
        type="number"
        inputMode="numeric"
        min={5}
        max={480}
        step={5}
        value={duration}
        placeholder={String(service.durationMinutes)}
        onChange={(e) => {
          setDuration(e.target.value);
        }}
      />
      {error !== undefined && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => void save()}
      >
        Salvar valores
      </button>
    </div>
  );
}
