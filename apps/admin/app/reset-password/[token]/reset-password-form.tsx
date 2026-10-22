"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ResetInput } from "@barbearia/contracts";
import { callWithoutResponse, ApiResponseError } from "../../../lib/api";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [invalid, setInvalid] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(undefined);
    setGeneralError(undefined);
    setSubmitting(true);
    try {
      const input: ResetInput = { token, password };
      await callWithoutResponse("/auth/password/reset", input);
      // The reset does not start a session: the person signs in right after.
      router.replace("/sign-in");
    } catch (failure) {
      if (
        failure instanceof ApiResponseError &&
        failure.code === "WEAK_PASSWORD"
      ) {
        setPasswordError(failure.fields["password"] ?? failure.message);
      } else if (
        failure instanceof ApiResponseError &&
        failure.code === "INVALID_TOKEN"
      ) {
        setInvalid(failure.message);
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

  if (invalid !== undefined) {
    return (
      <>
        <h1>Link indisponível</h1>
        <p role="alert">{invalid}</p>
        <p>
          <Link href="/forgot-password">Pedir um novo link</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Nova senha</h1>
      <p>Escolha a nova senha da sua conta.</p>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <label htmlFor="password">Nova senha</label>
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
          {submitting ? "Salvando…" : "Salvar nova senha"}
        </button>
      </form>
    </>
  );
}
