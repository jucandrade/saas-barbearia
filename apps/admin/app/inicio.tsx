"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EuSaida } from "@barbearia/contracts";
import { chamar, ErroDaApi } from "../lib/api";

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; eu: EuSaida };

/** Porta de entrada: donos vão para a Equipe; os demais veem um aviso. */
export function Inicio() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  useEffect(() => {
    let ativo = true;
    chamar("/auth/eu", { schema: EuSaida })
      .then((eu) => {
        if (!ativo) return;
        if (eu.usuario.papel === "dono") {
          router.replace("/equipe");
          return;
        }
        setEstado({ fase: "pronto", eu });
      })
      .catch((erro: unknown) => {
        if (!ativo) return;
        if (erro instanceof ErroDaApi && erro.status === 401) {
          router.replace("/entrar");
          return;
        }
        setEstado({
          fase: "erro",
          mensagem:
            erro instanceof Error
              ? erro.message
              : "Algo deu errado. Tente de novo.",
        });
      });
    return () => {
      ativo = false;
    };
  }, [router]);

  if (estado.fase === "carregando") {
    return <p role="status">Carregando…</p>;
  }
  if (estado.fase === "erro") {
    return <p role="alert">{estado.mensagem}</p>;
  }
  const { usuario, barbearia } = estado.eu;
  return (
    <>
      <h1>{barbearia.nome}</h1>
      <p>
        Olá, {usuario.nome}. A gestão da barbearia fica com os donos; use o app
        do barbeiro no celular.
      </p>
      <div className="cartao">
        {barbearia.unidades.map((unidade) => (
          <p key={unidade.id}>
            Unidade <strong>{unidade.nome}</strong> · fuso {unidade.fusoHorario}
          </p>
        ))}
      </div>
    </>
  );
}
