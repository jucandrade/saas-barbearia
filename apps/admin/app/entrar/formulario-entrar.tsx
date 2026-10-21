"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SessaoSaida, type LoginEntrada } from "@barbearia/contracts";
import { chamar, ErroDaApi } from "../../lib/api";

export function FormularioEntrar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(undefined);
    setEnviando(true);
    try {
      const entrada: LoginEntrada = { email, senha, cliente: "web" };
      await chamar("/auth/login", {
        metodo: "POST",
        corpo: entrada,
        schema: SessaoSaida,
      });
      router.replace("/");
    } catch (falha) {
      setErro(
        falha instanceof ErroDaApi
          ? falha.message
          : "Algo deu errado. Tente de novo.",
      );
      setEnviando(false);
    }
  }

  return (
    <>
      <h1>Entrar</h1>
      <p>Use o e-mail e a senha da sua conta.</p>
      <form onSubmit={(e) => void enviar(e)} noValidate>
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
        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value);
          }}
          required
        />
        {erro !== undefined && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <button
          type="submit"
          disabled={enviando || email.length === 0 || senha.length === 0}
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </>
  );
}
