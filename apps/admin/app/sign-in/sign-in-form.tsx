"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SessionOutput, type LoginInput } from "@barbearia/contracts";
import { call, ApiResponseError } from "../../lib/api";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const input: LoginInput = { email, password, client: "web" };
      await call("/auth/login", {
        method: "POST",
        body: input,
        schema: SessionOutput,
      });
      router.replace("/");
    } catch (failure) {
      setError(
        failure instanceof ApiResponseError
          ? failure.message
          : "Algo deu errado. Tente de novo.",
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Entrar</h1>
      <p>Use o e-mail e a senha da sua conta.</p>
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
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          required
        />
        {error !== undefined && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || email.length === 0 || password.length === 0}
        >
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p>
        <Link href="/forgot-password">Esqueci minha senha</Link>
      </p>
    </>
  );
}
