"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  CategoriesOutput,
  ServiceCategory,
  ServicesOutput,
  TeamOutput,
  type Service,
  type User,
} from "@barbearia/contracts";
import { call, callWithoutResponse, ApiResponseError } from "../../lib/api";
import { messageOf } from "./errors";
import { ExecutorsPanel } from "./executors-panel";
import { formatPrice } from "./money";
import { ServiceForm } from "./service-form";

type Load =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      categories: ServiceCategory[];
      services: Service[];
      people: User[];
    };

export function Catalog() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [editing, setEditing] = useState<string | undefined>();
  const [openExecutors, setOpenExecutors] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    Promise.all([
      call("/service-categories", { schema: CategoriesOutput }),
      call("/services", { schema: ServicesOutput }),
      call("/team", { schema: TeamOutput }),
    ])
      .then(([categories, services, team]) => {
        if (active) {
          setLoad({
            phase: "ready",
            categories: categories.categories,
            services: services.services,
            people: team.users.filter((u) => u.status === "active"),
          });
        }
      })
      .catch((failure: unknown) => {
        if (!active) return;
        if (failure instanceof ApiResponseError && failure.status === 401) {
          router.replace("/sign-in");
          return;
        }
        setLoad({ phase: "error", message: messageOf(failure) });
      });
    return () => {
      active = false;
    };
  }, [version, router]);

  const reload = () => {
    setVersion((v) => v + 1);
  };

  async function run(action: () => Promise<string | undefined>) {
    setError(undefined);
    setNotice(undefined);
    setBusy(true);
    try {
      setNotice(await action());
      reload();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      await call("/service-categories", {
        method: "POST",
        body: { name: newCategory },
        schema: ServiceCategory,
      });
      setNewCategory("");
      return "Categoria criada.";
    });
  }

  function renameCategory(category: ServiceCategory) {
    const name = window.prompt("Novo nome da categoria:", category.name);
    if (name === null || name.trim() === "") {
      return;
    }
    void run(async () => {
      await call(`/service-categories/${category.id}`, {
        method: "PATCH",
        body: { name },
        schema: ServiceCategory,
      });
      return "Categoria renomeada.";
    });
  }

  function move(categories: ServiceCategory[], index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= categories.length) {
      return;
    }
    const ids = categories.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target] ?? "", ids[index] ?? ""];
    void run(async () => {
      await callWithoutResponse("/service-categories/order", { ids }, "PUT");
      return undefined;
    });
  }

  function setServiceActive(service: Service, active: boolean) {
    if (
      !active &&
      !window.confirm(
        `Desativar ${service.name}? Ele deixa de ser oferecido para novos atendimentos.`,
      )
    ) {
      return;
    }
    void run(async () => {
      await callWithoutResponse(
        `/services/${service.id}/${active ? "reactivate" : "deactivate"}`,
      );
      return active
        ? `${service.name} voltou a ser oferecido.`
        : `${service.name} foi desativado.`;
    });
  }

  function removeCategory(category: ServiceCategory) {
    if (!window.confirm(`Remover a categoria ${category.name}?`)) {
      return;
    }
    void run(async () => {
      await callWithoutResponse(
        `/service-categories/${category.id}`,
        undefined,
        "DELETE",
      );
      return "Categoria removida.";
    });
  }

  return (
    <>
      <h1>Catálogo</h1>
      <p>Cadastre os serviços da barbearia, com preço e duração.</p>

      {notice !== undefined && (
        <p role="status" className="hint">
          {notice}
        </p>
      )}
      {error !== undefined && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {load.phase === "loading" && <p role="status">Carregando…</p>}
      {load.phase === "error" && (
        <p role="alert" className="error">
          {load.message}
        </p>
      )}

      {load.phase === "ready" && (
        <>
          <h2>Categorias</h2>
          <form onSubmit={addCategory} noValidate className="card">
            <label htmlFor="new-category">Nova categoria</label>
            <input
              id="new-category"
              value={newCategory}
              maxLength={80}
              onChange={(e) => {
                setNewCategory(e.target.value);
              }}
              autoComplete="off"
            />
            <button type="submit" disabled={busy || newCategory.trim() === ""}>
              Criar categoria
            </button>
          </form>

          {load.categories.length === 0 ? (
            <p className="hint">
              Crie a primeira categoria para poder cadastrar serviços.
            </p>
          ) : (
            <>
              <h2>Novo serviço</h2>
              <ServiceForm
                categories={load.categories}
                onSaved={(message) => {
                  setNotice(message);
                  reload();
                }}
              />
            </>
          )}

          {load.categories.map((category, index) => {
            const inCategory = load.services.filter(
              (s) => s.categoryId === category.id,
            );
            const inside = inCategory.filter((s) => s.status === "active");
            const off = inCategory.filter((s) => s.status === "deactivated");
            return (
              <section key={category.id} aria-label={category.name}>
                <h2>{category.name}</h2>
                <div className="actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || index === 0}
                    onClick={() => {
                      move(load.categories, index, -1);
                    }}
                  >
                    Subir
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || index === load.categories.length - 1}
                    onClick={() => {
                      move(load.categories, index, 1);
                    }}
                  >
                    Descer
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      renameCategory(category);
                    }}
                  >
                    Renomear
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      removeCategory(category);
                    }}
                  >
                    Remover
                  </button>
                </div>
                {inside.length === 0 && (
                  <p className="hint">Nenhum serviço ativo nesta categoria.</p>
                )}
                <ul className="list">
                  {inside.map((service) => (
                    <li key={service.id} className="card">
                      {editing === service.id ? (
                        <ServiceForm
                          categories={load.categories}
                          service={service}
                          onSaved={(message) => {
                            setNotice(message);
                            setEditing(undefined);
                            reload();
                          }}
                          onCancel={() => {
                            setEditing(undefined);
                          }}
                        />
                      ) : (
                        <>
                          <strong>{service.name}</strong>
                          <span className="hint">
                            {String(service.durationMinutes)} min ·{" "}
                            {formatPrice(service.priceCents)}
                          </span>
                          {service.description !== null && (
                            <span className="hint">{service.description}</span>
                          )}
                          {service.executorCount === 0 && (
                            <span className="warning">Sem executor</span>
                          )}
                          <div className="actions">
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy}
                              onClick={() => {
                                setEditing(service.id);
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy}
                              onClick={() => {
                                setServiceActive(service, false);
                              }}
                            >
                              Desativar
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setOpenExecutors(
                                  openExecutors === service.id
                                    ? undefined
                                    : service.id,
                                );
                              }}
                            >
                              Executores
                            </button>
                          </div>
                          {openExecutors === service.id && (
                            <ExecutorsPanel
                              service={service}
                              people={load.people}
                              onChanged={reload}
                            />
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {off.length > 0 && (
                  <details>
                    <summary>Desativados ({String(off.length)})</summary>
                    <ul className="list">
                      {off.map((service) => (
                        <li key={service.id} className="card">
                          <strong>{service.name}</strong>
                          <span className="hint">
                            {String(service.durationMinutes)} min ·{" "}
                            {formatPrice(service.priceCents)}
                          </span>
                          <div className="actions">
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy}
                              onClick={() => {
                                setServiceActive(service, true);
                              }}
                            >
                              Reativar
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
