"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EuSaida } from "@barbearia/contracts";
import { chamar, chamarSemResposta } from "../lib/api";

/** Cabeçalho do admin: mostra quem está logado e o botão de sair. */
export function Cabecalho() {
  const router = useRouter();
  const caminho = usePathname();
  const [eu, setEu] = useState<EuSaida | undefined>();

  // Refaz a consulta a cada troca de página: o layout não é remontado ao entrar.
  useEffect(() => {
    let ativo = true;
    chamar("/auth/eu", { schema: EuSaida })
      .then((resposta) => {
        if (ativo) setEu(resposta);
      })
      .catch(() => {
        if (ativo) setEu(undefined);
      });
    return () => {
      ativo = false;
    };
  }, [caminho]);

  async function sair() {
    try {
      await chamarSemResposta("/auth/logout");
    } finally {
      setEu(undefined);
      router.replace("/entrar");
    }
  }

  if (eu === undefined) {
    return null;
  }
  return (
    <header className="cabecalho">
      <span>
        <strong>{eu.barbearia.nome}</strong> · {eu.usuario.nome}
      </span>
      <button type="button" className="secundario" onClick={() => void sair()}>
        Sair
      </button>
    </header>
  );
}
