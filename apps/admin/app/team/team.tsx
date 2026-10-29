"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  InviteOutput,
  ResendOutput,
  TeamOutput,
  type InviteInput,
  type User,
} from "@barbearia/contracts";
import { call, callWithoutResponse, ApiResponseError } from "../../lib/api";
import { DataTable, type Column, type Sorting } from "../components/data-table";
import { FilterBar } from "../components/filter-bar";
import { SidePanel } from "../components/side-panel";

const STATUS_LABEL: Record<User["status"], string> = {
  invited: "Convite pendente",
  active: "Ativo",
  deactivated: "Desativado",
};

const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "invited", label: "Convite pendente" },
  { value: "deactivated", label: "Desativados" },
] as const;

const SORT_OPTIONS = [
  { value: "name", label: "Nome" },
  { value: "status", label: "Situação" },
] as const;

const ERROR_MESSAGES: Record<string, string> = {
  LAST_OWNER: "A barbearia precisa de pelo menos um dono ativo.",
  EMAIL_UNAVAILABLE: "Esse e-mail não está disponível. Use outro.",
  NO_PERMISSION: "Só donos podem gerenciar a equipe.",
};

function messageOf(error: unknown): string {
  if (error instanceof ApiResponseError) {
    return ERROR_MESSAGES[error.code] ?? error.message;
  }
  return "Algo deu errado. Tente de novo.";
}

type Load =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; users: User[] };

type Panel = { mode: "invite" } | { mode: "person"; id: string } | undefined;

const roleLabel = (user: User): string =>
  user.role === "owner" ? "Dono" : "Barbeiro";

/** Team for the owner at the computer: table with filter and sorting, actions in a side panel. */
export function Team() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>();
  const [status, setStatus] = useState<"all" | User["status"]>("all");
  const [sorting, setSorting] = useState<Sorting>({
    key: "name",
    direction: "asc",
  });

  const nameField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteInput["role"]>("barber");

  useEffect(() => {
    let active = true;
    call("/team", { schema: TeamOutput })
      .then((response) => {
        if (active) setLoad({ phase: "ready", users: response.users });
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

  const visible = useMemo(() => {
    if (load.phase !== "ready") return [];
    const filtered = load.users.filter(
      (user) => status === "all" || user.status === status,
    );
    const sign = sorting.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "pt-BR");
      const order =
        sorting.key === "status"
          ? STATUS_LABEL[a.status].localeCompare(
              STATUS_LABEL[b.status],
              "pt-BR",
            ) || byName
          : byName;
      return sign * order;
    });
  }, [load, status, sorting]);

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
      setVersion((v) => v + 1);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const input: InviteInput = { name, email, role };
      const output = await call("/team/invitations", {
        method: "POST",
        body: input,
        schema: InviteOutput,
      });
      setName("");
      setEmail("");
      // Several invitations in a row, keyboard only: back to the first field (FR-017).
      nameField.current?.focus();
      return output.invitationSent
        ? `Convite enviado para ${output.user.email}.`
        : "O convite foi criado, mas o e-mail não pôde ser enviado. Use “Reenviar convite”.";
    });
  }

  function resend(user: User) {
    void run(async () => {
      const output = await call(`/team/${user.id}/resend-invitation`, {
        method: "POST",
        schema: ResendOutput,
      });
      return output.invitationSent
        ? `Novo convite enviado para ${user.email}.`
        : "O e-mail não pôde ser enviado. Tente de novo.";
    });
  }

  function deactivate(user: User) {
    if (
      !window.confirm(`Desativar ${user.name}? A pessoa perde o acesso agora.`)
    ) {
      return;
    }
    void run(async () => {
      await callWithoutResponse(`/team/${user.id}/deactivate`);
      return `${user.name} foi desativado(a).`;
    });
  }

  function reactivate(user: User) {
    void run(async () => {
      await callWithoutResponse(`/team/${user.id}/reactivate`);
      return `${user.name} foi reativado(a).`;
    });
  }

  const columns: Column<User>[] = [
    { key: "name", header: "Nome", sortable: true, render: (u) => u.name },
    { key: "email", header: "E-mail", render: (u) => u.email },
    { key: "role", header: "Papel", render: roleLabel },
    {
      key: "status",
      header: "Situação",
      sortable: true,
      render: (u) =>
        u.status === "active" ? (
          <span className="badge">{STATUS_LABEL[u.status]}</span>
        ) : (
          <span className="hint-inline">{STATUS_LABEL[u.status]}</span>
        ),
    },
  ];

  const selected =
    panel?.mode === "person" && load.phase === "ready"
      ? load.users.find((user) => user.id === panel.id)
      : undefined;

  return (
    <>
      <div className="toolbar">
        <h1>Equipe</h1>
        <FilterBar
          statusLabel="Situação"
          statusOptions={STATUS_OPTIONS}
          status={status}
          onStatus={(value) => {
            setStatus(value as typeof status);
          }}
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
        <button
          type="button"
          onClick={() => {
            setPanel({ mode: "invite" });
          }}
        >
          Convidar pessoa
        </button>
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
        <div className={panel === undefined ? "split" : "split has-panel"}>
          <DataTable
            caption="Pessoas da equipe"
            columns={columns}
            rows={visible}
            rowKey={(user) => user.id}
            sorting={sorting}
            onSort={sortBy}
            selectedKey={panel?.mode === "person" ? panel.id : undefined}
            onSelect={(user) => {
              setPanel({ mode: "person", id: user.id });
            }}
            selectLabel={(user) => `Abrir ${user.name}`}
            emptyMessage="Ninguém com esse filtro."
          />

          {panel?.mode === "invite" && (
            <SidePanel
              title="Convidar pessoa"
              onClose={() => {
                setPanel(undefined);
              }}
            >
              <form onSubmit={invite} noValidate className="card">
                <label htmlFor="name">Nome</label>
                <input
                  id="name"
                  ref={nameField}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                  autoComplete="off"
                />
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                  }}
                  autoComplete="off"
                />
                <label htmlFor="role">Papel</label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value as InviteInput["role"]);
                  }}
                >
                  <option value="barber">Barbeiro</option>
                  <option value="owner">Dono</option>
                </select>
                <button
                  type="submit"
                  disabled={busy || name.trim() === "" || email.trim() === ""}
                >
                  Enviar convite
                </button>
              </form>
            </SidePanel>
          )}

          {selected !== undefined && (
            <SidePanel
              key={selected.id}
              title={selected.name}
              onClose={() => {
                setPanel(undefined);
              }}
            >
              <p className="hint">
                {selected.email} · {roleLabel(selected)} ·{" "}
                {STATUS_LABEL[selected.status]}
              </p>
              <div className="actions">
                {selected.status === "invited" && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      resend(selected);
                    }}
                  >
                    Reenviar convite
                  </button>
                )}
                {selected.status !== "deactivated" && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      deactivate(selected);
                    }}
                  >
                    Desativar
                  </button>
                )}
                {selected.status === "deactivated" && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      reactivate(selected);
                    }}
                  >
                    Reativar
                  </button>
                )}
              </div>
            </SidePanel>
          )}
        </div>
      )}
    </>
  );
}
