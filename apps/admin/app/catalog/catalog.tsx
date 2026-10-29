"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CategoriesOutput,
  ServiceCategory,
  ServicesOutput,
  TeamOutput,
  type Service,
  type User,
} from "@barbearia/contracts";
import {
  filterServices,
  sortServices,
  type ListableService,
  type ServiceSortKey,
} from "@barbearia/domain";
import { call, callWithoutResponse, ApiResponseError } from "../../lib/api";
import { DataTable, type Column, type Sorting } from "../components/data-table";
import { FilterBar } from "../components/filter-bar";
import { SidePanel } from "../components/side-panel";
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

/** A service as a table row: the list functions of the domain need the category name and the count. */
type Row = Service & ListableService;

type Panel = { mode: "create" } | { mode: "edit"; id: string } | undefined;

const SORT_OPTIONS = [
  { value: "name", label: "Nome" },
  { value: "category", label: "Categoria" },
  { value: "duration", label: "Duração" },
  { value: "price", label: "Preço" },
] as const;

const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "deactivated", label: "Desativados" },
] as const;

/** Catalog for the owner at the computer: table with sorting and filters, edit in a side panel. */
export function Catalog() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [panel, setPanel] = useState<Panel>();
  const [status, setStatus] = useState<"all" | "active" | "deactivated">("all");
  const [withoutExecutor, setWithoutExecutor] = useState(false);
  const [sorting, setSorting] = useState<Sorting>({
    key: "name",
    direction: "asc",
  });

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

  const rows = useMemo<Row[]>(() => {
    if (load.phase !== "ready") return [];
    const names = new Map(load.categories.map((c) => [c.id, c.name]));
    return load.services.map((service) => ({
      ...service,
      categoryName: names.get(service.categoryId) ?? "",
      executorCount: service.executorCount ?? 0,
    }));
  }, [load]);

  const visible = useMemo(
    () =>
      sortServices(filterServices(rows, { status, withoutExecutor }), {
        by: sorting.key as ServiceSortKey,
        direction: sorting.direction,
      }),
    [rows, status, withoutExecutor, sorting],
  );

  function sortBy(key: string) {
    setSorting((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

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

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Nome",
      sortable: true,
      render: (row) => row.name,
    },
    {
      key: "category",
      header: "Categoria",
      sortable: true,
      render: (row) => row.categoryName,
    },
    {
      key: "duration",
      header: "Duração",
      sortable: true,
      align: "right",
      render: (row) => `${String(row.durationMinutes)} min`,
    },
    {
      key: "price",
      header: "Preço",
      sortable: true,
      align: "right",
      render: (row) => formatPrice(row.priceCents),
    },
    {
      key: "status",
      header: "Situação",
      render: (row) =>
        row.status === "active" ? (
          <span className="badge">Ativo</span>
        ) : (
          <span className="hint-inline">Desativado</span>
        ),
    },
    {
      key: "executors",
      header: "Executores",
      align: "right",
      render: (row) =>
        row.executorCount === 0 ? (
          <span className="warning">Sem executor</span>
        ) : (
          String(row.executorCount)
        ),
    },
  ];

  const editing =
    panel?.mode === "edit" && load.phase === "ready"
      ? load.services.find((service) => service.id === panel.id)
      : undefined;

  return (
    <>
      <div className="toolbar">
        <h1>Catálogo</h1>
        <FilterBar
          statusLabel="Situação"
          statusOptions={STATUS_OPTIONS}
          status={status}
          onStatus={(value) => {
            setStatus(value as typeof status);
          }}
          checks={[
            {
              id: "without-executor",
              label: "Sem executor",
              checked: withoutExecutor,
              onChange: setWithoutExecutor,
            },
          ]}
          sort={{
            options: SORT_OPTIONS,
            value: sorting.key,
            direction: sorting.direction,
            onChange: (key) => {
              setSorting((current) => ({ ...current, key }));
            },
            onDirection: (direction) => {
              setSorting((current) => ({ ...current, direction }));
            },
          }}
        />
        {load.phase === "ready" && load.categories.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setPanel({ mode: "create" });
            }}
          >
            Novo serviço
          </button>
        )}
      </div>

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
          <details className="card categories">
            <summary>Categorias ({String(load.categories.length)})</summary>
            <form onSubmit={addCategory} noValidate>
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
              <button
                type="submit"
                disabled={busy || newCategory.trim() === ""}
              >
                Criar categoria
              </button>
            </form>
            {load.categories.length === 0 && (
              <p className="hint">
                Crie a primeira categoria para poder cadastrar serviços.
              </p>
            )}
            {load.categories.map((category, index) => (
              <div key={category.id} className="category-row">
                <strong>{category.name}</strong>
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
              </div>
            ))}
          </details>

          <div className={panel === undefined ? "split" : "split has-panel"}>
            <DataTable
              caption="Serviços do catálogo"
              columns={columns}
              rows={visible}
              rowKey={(row) => row.id}
              sorting={sorting}
              onSort={sortBy}
              selectedKey={panel?.mode === "edit" ? panel.id : undefined}
              onSelect={(row) => {
                setPanel({ mode: "edit", id: row.id });
              }}
              selectLabel={(row) => `Editar ${row.name}`}
              emptyMessage={
                rows.length === 0
                  ? "Nenhum serviço cadastrado ainda."
                  : "Nenhum serviço com esses filtros."
              }
            />
            {panel?.mode === "create" && (
              <SidePanel
                title="Novo serviço"
                onClose={() => {
                  setPanel(undefined);
                }}
              >
                <ServiceForm
                  categories={load.categories}
                  onSaved={(message) => {
                    setNotice(message);
                    reload();
                  }}
                />
              </SidePanel>
            )}
            {editing !== undefined && (
              <SidePanel
                key={editing.id}
                title={editing.name}
                onClose={() => {
                  setPanel(undefined);
                }}
              >
                <ServiceForm
                  categories={load.categories}
                  service={editing}
                  onSaved={(message) => {
                    setNotice(message);
                    reload();
                  }}
                />
                <div className="actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setServiceActive(editing, editing.status !== "active");
                    }}
                  >
                    {editing.status === "active" ? "Desativar" : "Reativar"}
                  </button>
                </div>
                <h3>Executores</h3>
                <ExecutorsPanel
                  service={editing}
                  people={load.people}
                  onChanged={reload}
                />
              </SidePanel>
            )}
          </div>
        </>
      )}
    </>
  );
}
