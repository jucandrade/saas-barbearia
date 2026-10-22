"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  AcceptInvitationInput,
  InvitationInfo,
  SessionOutput,
} from "@barbearia/contracts";
import { call, ApiResponseError } from "../../../lib/api";

const INVALID_MESSAGE =
  "Este convite não é mais válido. Peça um novo ao dono da barbearia.";

type State =
  | { phase: "loading" }
  | { phase: "invalid"; message: string }
  | { phase: "ready"; name: string; barbershop: string };

export function InvitationForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    call(`/auth/invitations/${encodeURIComponent(token)}`, {
      schema: InvitationInfo,
    })
      .then((info) => {
        if (active)
          setState({
            phase: "ready",
            name: info.name,
            barbershop: info.barbershop,
          });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          error instanceof ApiResponseError &&
          error.code !== "INVALID_INVITATION"
            ? error.message
            : INVALID_MESSAGE;
        setState({ phase: "invalid", message });
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(undefined);
    setGeneralError(undefined);
    setSubmitting(true);
    try {
      const input: AcceptInvitationInput = { token, password, client: "web" };
      await call("/auth/invitations/accept", {
        method: "POST",
        body: input,
        schema: SessionOutput,
      });
      router.replace("/");
    } catch (failure) {
      if (
        failure instanceof ApiResponseError &&
        failure.code === "WEAK_PASSWORD"
      ) {
        setPasswordError(failure.fields["password"] ?? failure.message);
      } else if (
        failure instanceof ApiResponseError &&
        failure.code === "INVALID_INVITATION"
      ) {
        setState({ phase: "invalid", message: INVALID_MESSAGE });
      } else {
        setGeneralError(
          failure instanceof ApiResponseError
            ? failure.message
            : "Algo deu errado. Tente de novo.",
        );
      }
      setSubmitting(false);
    }
  }

  if (state.phase === "loading") {
    return <p role="status">Carregando convite…</p>;
  }
  if (state.phase === "invalid") {
    return (
      <>
        <h1>Convite indisponível</h1>
        <p role="alert">{state.message}</p>
      </>
    );
  }

  return (
    <>
      <h1>Olá, {state.name}!</h1>
      <p>
        Crie a sua senha para acessar <strong>{state.barbershop}</strong>.
      </p>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          aria-invalid={passwordError !== undefined}
          aria-describedby="password-hint password-error"
          required
        />
        <p id="password-hint" className="hint">
          Use pelo menos 8 caracteres. Evite senhas comuns e o seu nome ou
          e-mail.
        </p>
        {passwordError !== undefined && (
          <p id="password-error" className="error" role="alert">
            {passwordError}
          </p>
        )}
        {generalError !== undefined && (
          <p className="error" role="alert">
            {generalError}
          </p>
        )}
        <button type="submit" disabled={submitting || password.length === 0}>
          {submitting ? "Entrando…" : "Criar senha e entrar"}
        </button>
      </form>
    </>
  );
}
