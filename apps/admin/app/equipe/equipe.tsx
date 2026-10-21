"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  ConvidarSaida,
  EquipeSaida,
  ReenviarSaida,
  type ConvidarEntrada,
  type Usuario,
} from "@barbearia/contracts";
import { chamar, chamarSemResposta, ErroDaApi } from "../../lib/api";

const SITUACAO: Record<Usuario["situacao"], string> = {
  convidado: "Convite pendente",
  ativo: "Ativo",
  desativado: "Desativado",
};

const MENSAGENS_DE_ERRO: Record<string, string> = {
  ULTIMO_DONO: "A barbearia precisa de pelo menos um dono ativo.",
  EMAIL_INDISPONIVEL: "Esse e-mail não está disponível. Use outro.",
  SEM_PERMISSAO: "Só donos podem gerenciar a equipe.",
};

function mensagemDe(erro: unknown): string {
  if (erro instanceof ErroDaApi) {
    return MENSAGENS_DE_ERRO[erro.codigo] ?? erro.message;
  }
  return "Algo deu errado. Tente de novo.";
}

type Carga =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronta"; usuarios: Usuario[] };

export function Equipe() {
  const router = useRouter();
  const [carga, setCarga] = useState<Carga>({ fase: "carregando" });
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<string | undefined>();
  const [erro, setErro] = useState<string | undefined>();
  const [ocupado, setOcupado] = useState(false);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<ConvidarEntrada["papel"]>("barbeiro");

  useEffect(() => {
    let ativo = true;
    chamar("/equipe", { schema: EquipeSaida })
      .then((resposta) => {
        if (ativo) setCarga({ fase: "pronta", usuarios: resposta.usuarios });
      })
      .catch((falha: unknown) => {
        if (!ativo) return;
        if (falha instanceof ErroDaApi && falha.status === 401) {
          router.replace("/entrar");
          return;
        }
        setCarga({ fase: "erro", mensagem: mensagemDe(falha) });
      });
    return () => {
      ativo = false;
    };
  }, [versao, router]);

  async function executar(acao: () => Promise<string | undefined>) {
    setErro(undefined);
    setAviso(undefined);
    setOcupado(true);
    try {
      setAviso(await acao());
      setVersao((v) => v + 1);
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setOcupado(false);
    }
  }

  function convidar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void executar(async () => {
      const entrada: ConvidarEntrada = { nome, email, papel };
      const saida = await chamar("/equipe/convites", {
        metodo: "POST",
        corpo: entrada,
        schema: ConvidarSaida,
      });
      setNome("");
      setEmail("");
      return saida.conviteEnviado
        ? `Convite enviado para ${saida.usuario.email}.`
        : "O convite foi criado, mas o e-mail não pôde ser enviado. Use “Reenviar convite”.";
    });
  }

  function reenviar(usuario: Usuario) {
    void executar(async () => {
      const saida = await chamar(`/equipe/${usuario.id}/reenviar-convite`, {
        metodo: "POST",
        schema: ReenviarSaida,
      });
      return saida.conviteEnviado
        ? `Novo convite enviado para ${usuario.email}.`
        : "O e-mail não pôde ser enviado. Tente de novo.";
    });
  }

  function desativar(usuario: Usuario) {
    if (
      !window.confirm(
        `Desativar ${usuario.nome}? A pessoa perde o acesso agora.`,
      )
    ) {
      return;
    }
    void executar(async () => {
      await chamarSemResposta(`/equipe/${usuario.id}/desativar`);
      return `${usuario.nome} foi desativado(a).`;
    });
  }

  function reativar(usuario: Usuario) {
    void executar(async () => {
      await chamarSemResposta(`/equipe/${usuario.id}/reativar`);
      return `${usuario.nome} foi reativado(a).`;
    });
  }

  return (
    <>
      <h1>Equipe</h1>
      <p>Convide donos e barbeiros e controle quem tem acesso.</p>

      <form onSubmit={convidar} noValidate className="cartao">
        <label htmlFor="nome">Nome</label>
        <input
          id="nome"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value);
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
        <label htmlFor="papel">Papel</label>
        <select
          id="papel"
          value={papel}
          onChange={(e) => {
            setPapel(e.target.value as ConvidarEntrada["papel"]);
          }}
        >
          <option value="barbeiro">Barbeiro</option>
          <option value="dono">Dono</option>
        </select>
        <button
          type="submit"
          disabled={ocupado || nome.trim() === "" || email.trim() === ""}
        >
          Enviar convite
        </button>
      </form>

      {aviso !== undefined && (
        <p role="status" className="dica">
          {aviso}
        </p>
      )}
      {erro !== undefined && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}

      {carga.fase === "carregando" && <p role="status">Carregando…</p>}
      {carga.fase === "erro" && (
        <p role="alert" className="erro">
          {carga.mensagem}
        </p>
      )}
      {carga.fase === "pronta" && (
        <ul className="lista">
          {carga.usuarios.map((usuario) => (
            <li key={usuario.id} className="cartao">
              <strong>{usuario.nome}</strong>
              <span className="dica">
                {usuario.email} ·{" "}
                {usuario.papel === "dono" ? "Dono" : "Barbeiro"} ·{" "}
                {SITUACAO[usuario.situacao]}
              </span>
              <div className="acoes">
                {usuario.situacao === "convidado" && (
                  <button
                    type="button"
                    className="secundario"
                    disabled={ocupado}
                    onClick={() => {
                      reenviar(usuario);
                    }}
                  >
                    Reenviar convite
                  </button>
                )}
                {usuario.situacao !== "desativado" && (
                  <button
                    type="button"
                    className="secundario"
                    disabled={ocupado}
                    onClick={() => {
                      desativar(usuario);
                    }}
                  >
                    Desativar
                  </button>
                )}
                {usuario.situacao === "desativado" && (
                  <button
                    type="button"
                    className="secundario"
                    disabled={ocupado}
                    onClick={() => {
                      reativar(usuario);
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
