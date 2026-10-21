"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ForgotOutput, type ForgotInput } from "@barbearia/contracts";
import { call, ApiResponseError } from "../../lib/api";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const input: ForgotInput = { email };
      // The answer is always the same, whether or not the account exists.
      const output = await call("/auth/password/forgot", {
        method: "POST",
        body: input,
        schema: ForgotOutput,
      });
      setMessage(output.message);
    } catch (failure) {
      setError(
        failure instanceof ApiResponseError
          ? failure.message
          : "Algo deu errado. Tente de novo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Esqueci minha senha</h1>
      <p>
        Informe o e-mail da sua conta e enviaremos um link para criar uma nova
        senha.
      </p>
      {message !== undefined ? (
        <p role="status" className="card">
          {message}
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            required
          />
          {error !== undefined && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={submitting || email.length === 0}>
            {submitting ? "Enviando…" : "Enviar link"}
          </button>
        </form>
      )}
      <p>
        <Link href="/sign-in">Voltar para entrar</Link>
      </p>
    </>
  );
}
