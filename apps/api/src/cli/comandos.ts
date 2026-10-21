import { parseArgs } from "node:util";
import { ProvisionarBarbeariaComando } from "@barbearia/contracts";
import { ErroPlataforma } from "../identidade/provisionamento/erro-plataforma.js";
import type { ProvisionamentoService } from "../identidade/provisionamento/provisionamento.service.js";
import type { ReenvioConviteDonoService } from "../identidade/provisionamento/reenvio-convite-dono.service.js";

export interface SaidaCli {
  out(mensagem: string): void;
  err(mensagem: string): void;
}

export interface DepsCli {
  provisionamento: Pick<ProvisionamentoService, "provisionar">;
  reenvio: Pick<ReenvioConviteDonoService, "reenviar">;
}

type Comando = (args: string[], deps: DepsCli, io: SaidaCli) => Promise<number>;

const CODIGO_FALHA = 1;
const CODIGO_ERRO_INESPERADO = 2;
const CODIGO_CONVITE_NAO_ENVIADO = 3;

/** Só o tipo do erro: a mensagem de uma falha de banco pode trazer dados pessoais. */
function descreverErro(erro: unknown): string {
  return erro instanceof Error ? erro.constructor.name : typeof erro;
}

async function protegido(
  io: SaidaCli,
  execucao: () => Promise<number>,
): Promise<number> {
  try {
    return await execucao();
  } catch (erro) {
    if (erro instanceof ErroPlataforma) {
      io.err(erro.message);
      return CODIGO_FALHA;
    }
    io.err(`Erro inesperado (${descreverErro(erro)}). Nada foi concluído.`);
    return CODIGO_ERRO_INESPERADO;
  }
}

const provisionarBarbearia: Comando = (args, deps, io) =>
  protegido(io, async () => {
    const { values } = parseArgs({
      args,
      strict: true,
      options: {
        nome: { type: "string" },
        unidade: { type: "string" },
        fuso: { type: "string" },
        "dono-nome": { type: "string" },
        "dono-email": { type: "string" },
      },
    });
    const comando = ProvisionarBarbeariaComando.safeParse({
      nome: values.nome,
      unidade: values.unidade,
      fuso: values.fuso,
      donoNome: values["dono-nome"],
      donoEmail: values["dono-email"],
    });
    if (!comando.success) {
      for (const problema of comando.error.issues) {
        io.err(`Argumento inválido: ${problema.path.join(".")}`);
      }
      return CODIGO_FALHA;
    }
    const resultado = await deps.provisionamento.provisionar(comando.data);
    if (!resultado.conviteEnviado) {
      io.err(
        `Barbearia criada (id: ${resultado.barbeariaId}), mas o convite não foi enviado. ` +
          "Resolva o envio de e-mail e rode 'reenviar-convite-dono --email <e-mail do dono>'.",
      );
      return CODIGO_CONVITE_NAO_ENVIADO;
    }
    io.out(`Barbearia provisionada: ${resultado.barbeariaId}`);
    return 0;
  });

const reenviarConviteDono: Comando = (args, deps, io) =>
  protegido(io, async () => {
    const { values } = parseArgs({
      args,
      strict: true,
      options: { email: { type: "string" }, "novo-email": { type: "string" } },
    });
    if (values.email === undefined) {
      io.err("Argumento inválido: email");
      return CODIGO_FALHA;
    }
    const resultado = await deps.reenvio.reenviar({
      email: values.email,
      ...(values["novo-email"] === undefined
        ? {}
        : { novoEmail: values["novo-email"] }),
    });
    if (!resultado.conviteEnviado) {
      io.err(
        "O convite foi renovado, mas o e-mail não pôde ser enviado. Tente de novo.",
      );
      return CODIGO_CONVITE_NAO_ENVIADO;
    }
    io.out("Convite reenviado.");
    return 0;
  });

const COMANDOS: Record<string, Comando> = {
  "provisionar-barbearia": provisionarBarbearia,
  "reenviar-convite-dono": reenviarConviteDono,
};

/** Despacha o comando e devolve o código de saída (≠ 0 em qualquer falha). */
export async function executarCli(
  argv: string[],
  deps: DepsCli,
  io: SaidaCli,
): Promise<number> {
  const [nome, ...resto] = argv;
  const comando = nome === undefined ? undefined : COMANDOS[nome];
  if (comando === undefined) {
    io.err(`Comandos disponíveis: ${Object.keys(COMANDOS).join(", ")}`);
    return CODIGO_FALHA;
  }
  return protegido(io, () => comando(resto, deps, io));
}
