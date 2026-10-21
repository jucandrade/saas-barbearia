"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  InviteOutput,
  ResendOutput,
  TeamOutput,
  type InviteInput,
  type User,
} from "@barbearia/contracts";
import { call, callWithoutResponse, ApiResponseError } from "../../lib/api";

const STATUS_LABEL: Record<User["status"], string> = {
  invited: "Convite pendente",
  active: "Ativo",
  deactivated: "Desativado",
};

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

export function Team() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

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

  return (
    <>
      <h1>Equipe</h1>
      <p>Convide donos e barbeiros e controle quem tem acesso.</p>

      <form onSubmit={invite} noValidate className="card">
        <label htmlFor="name">Nome</label>
        <input
          id="name"
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
        <ul className="list">
          {load.users.map((user) => (
            <li key={user.id} className="card">
              <strong>{user.name}</strong>
              <span className="hint">
                {user.email} · {user.role === "owner" ? "Dono" : "Barbeiro"} ·{" "}
                {STATUS_LABEL[user.status]}
              </span>
              <div className="actions">
                {user.status === "invited" && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      resend(user);
                    }}
                  >
                    Reenviar convite
                  </button>
                )}
                {user.status !== "deactivated" && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      deactivate(user);
                    }}
                  >
                    Desativar
                  </button>
                )}
                {user.status === "deactivated" && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      reactivate(user);
                    }}
                  >
                    Reativar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
