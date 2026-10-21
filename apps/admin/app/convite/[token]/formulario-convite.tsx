"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  AceitarConviteEntrada,
  ConviteInfo,
  SessaoSaida,
} from "@barbearia/contracts";
import { chamar, ErroDaApi } from "../../../lib/api";

const MENSAGEM_INVALIDO =
  "Este convite não é mais válido. Peça um novo ao dono da barbearia.";

type Estado =
  | { fase: "carregando" }
  | { fase: "invalido"; mensagem: string }
  | { fase: "pronto"; nome: string; barbearia: string };

export function FormularioConvite({ token }: { token: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [senha, setSenha] = useState("");
  const [erroSenha, setErroSenha] = useState<string | undefined>();
  const [erroGeral, setErroGeral] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    chamar(`/auth/convites/${encodeURIComponent(token)}`, {
      schema: ConviteInfo,
    })
      .then((info) => {
        if (ativo)
          setEstado({
            fase: "pronto",
            nome: info.nome,
            barbearia: info.barbearia,
          });
      })
      .catch((erro: unknown) => {
        if (!ativo) return;
        const mensagem =
          erro instanceof ErroDaApi && erro.codigo !== "CONVITE_INVALIDO"
            ? erro.message
            : MENSAGEM_INVALIDO;
        setEstado({ fase: "invalido", mensagem });
      });
    return () => {
      ativo = false;
    };
  }, [token]);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroSenha(undefined);
    setErroGeral(undefined);
    setEnviando(true);
    try {
      const entrada: AceitarConviteEntrada = { token, senha, cliente: "web" };
      await chamar("/auth/convites/aceitar", {
        metodo: "POST",
        corpo: entrada,
        schema: SessaoSaida,
      });
      router.replace("/");
    } catch (erro) {
      if (erro instanceof ErroDaApi && erro.codigo === "SENHA_FRACA") {
        setErroSenha(erro.campos["senha"] ?? erro.message);
      } else if (
        erro instanceof ErroDaApi &&
        erro.codigo === "CONVITE_INVALIDO"
      ) {
        setEstado({ fase: "invalido", mensagem: MENSAGEM_INVALIDO });
      } else {
        setErroGeral(
          erro instanceof ErroDaApi
            ? erro.message
            : "Algo deu errado. Tente de novo.",
        );
      }
      setEnviando(false);
    }
  }

  if (estado.fase === "carregando") {
    return <p role="status">Carregando convite…</p>;
  }
  if (estado.fase === "invalido") {
    return (
      <>
        <h1>Convite indisponível</h1>
        <p role="alert">{estado.mensagem}</p>
      </>
    );
  }

  return (
    <>
      <h1>Olá, {estado.nome}!</h1>
      <p>
        Crie a sua senha para acessar <strong>{estado.barbearia}</strong>.
      </p>
      <form onSubmit={(e) => void enviar(e)} noValidate>
        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value);
          }}
          aria-invalid={erroSenha !== undefined}
          aria-describedby="dica-senha erro-senha"
          required
        />
        <p id="dica-senha" className="dica">
          Use pelo menos 8 caracteres. Evite senhas comuns e o seu nome ou
          e-mail.
        </p>
        {erroSenha !== undefined && (
          <p id="erro-senha" className="erro" role="alert">
            {erroSenha}
          </p>
        )}
        {erroGeral !== undefined && (
          <p className="erro" role="alert">
            {erroGeral}
          </p>
        )}
        <button type="submit" disabled={enviando || senha.length === 0}>
          {enviando ? "Entrando…" : "Criar senha e entrar"}
        </button>
      </form>
    </>
  );
}
