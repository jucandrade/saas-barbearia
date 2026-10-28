"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  Service,
  type CreateServiceInput,
  type ServiceCategory,
} from "@barbearia/contracts";
import { ApiResponseError, call } from "../../lib/api";
import { messageOf } from "./errors";
import { parsePrice, priceToInput } from "./money";

interface Props {
  categories: ServiceCategory[];
  /** The service being edited; absent when creating. */
  service?: Service;
  onSaved: (message: string) => void;
  onCancel?: () => void;
}

/** Create or edit a service: price in reais becomes whole cents, duration in steps of 5 minutes. */
export function ServiceForm({ categories, service, onSaved, onCancel }: Props) {
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [categoryId, setCategoryId] = useState(
    service?.categoryId ?? categories[0]?.id ?? "",
  );
  const [price, setPrice] = useState(
    service === undefined ? "" : priceToInput(service.priceCents),
  );
  const [duration, setDuration] = useState(
    service === undefined ? "30" : String(service.durationMinutes),
  );
  const nameField = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setFields({});
    const priceCents = parsePrice(price);
    if (priceCents === undefined) {
      setFields({ priceCents: "Informe o preço em reais, por exemplo 50,00." });
      return;
    }
    const input: CreateServiceInput = {
      name,
      categoryId,
      priceCents,
      durationMinutes: Number(duration),
      ...(description.trim() === "" && service === undefined
        ? {}
        : { description }),
    };
    setBusy(true);
    try {
      await call(
        service === undefined ? "/services" : `/services/${service.id}`,
        {
          method: service === undefined ? "POST" : "PATCH",
          body: input,
          schema: Service,
        },
      );
      if (service === undefined) {
        setName("");
        setDescription("");
        setPrice("");
        // Several services in a row, keyboard only: back to the first field (FR-017).
        nameField.current?.focus();
      }
      onSaved(
        service === undefined ? "Serviço cadastrado." : "Serviço atualizado.",
      );
    } catch (failure) {
      if (
        failure instanceof ApiResponseError &&
        failure.code === "INVALID_DATA"
      ) {
        setFields(failure.fields);
        setError("Confira os campos destacados.");
      } else {
        setError(messageOf(failure));
      }
    } finally {
      setBusy(false);
    }
  }

  const idPrefix = service?.id ?? "new";
  const fieldError = (key: string) =>
    fields[key] === undefined ? null : (
      <p role="alert" className="error">
        {fields[key]}
      </p>
    );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="card">
      <label htmlFor={`${idPrefix}-name`}>Nome</label>
      <input
        id={`${idPrefix}-name`}
        ref={nameField}
        value={name}
        maxLength={80}
        onChange={(e) => {
          setName(e.target.value);
        }}
        autoComplete="off"
      />
      {fieldError("name")}

      <label htmlFor={`${idPrefix}-category`}>Categoria</label>
      <select
        id={`${idPrefix}-category`}
        value={categoryId}
        onChange={(e) => {
          setCategoryId(e.target.value);
        }}
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      {fieldError("categoryId")}

      <label htmlFor={`${idPrefix}-price`}>Preço (R$)</label>
      <input
        id={`${idPrefix}-price`}
        inputMode="decimal"
        value={price}
        placeholder="50,00"
        onChange={(e) => {
          setPrice(e.target.value);
        }}
        autoComplete="off"
      />
      {fieldError("priceCents")}

      <label htmlFor={`${idPrefix}-duration`}>Duração (minutos)</label>
      <input
        id={`${idPrefix}-duration`}
        type="number"
        inputMode="numeric"
        min={5}
        max={480}
        step={5}
        value={duration}
        onChange={(e) => {
          setDuration(e.target.value);
        }}
      />
      {fieldError("durationMinutes")}

      <label htmlFor={`${idPrefix}-description`}>Descrição (opcional)</label>
      <input
        id={`${idPrefix}-description`}
        value={description}
        maxLength={500}
        onChange={(e) => {
          setDescription(e.target.value);
        }}
        autoComplete="off"
      />
      {fieldError("description")}

      {error !== undefined && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          type="submit"
          disabled={busy || name.trim() === "" || categoryId === ""}
        >
          {service === undefined ? "Cadastrar serviço" : "Salvar"}
        </button>
        {onCancel !== undefined && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
