import { lerEnv } from "../../../src/config/env.js";
import { TenantDb } from "../../../src/db/tenant-db.js";
import { AuditoriaService } from "../../../src/identidade/auditoria/auditoria.service.js";
import { ConvitesEmissor } from "../../../src/identidade/convites/convites-emissor.js";
import { MemoriaAdapter } from "../../../src/identidade/email/memoria.adapter.js";
import { ProvisionamentoService } from "../../../src/identidade/provisionamento/provisionamento.service.js";
import { ReenvioConviteDonoService } from "../../../src/identidade/provisionamento/reenvio-convite-dono.service.js";
import { RelogioControlavel } from "../../../src/identidade/relogio.js";
import { ORIGEM_ADMIN } from "./app.js";
import { conexaoAdmin } from "./db.js";

/**
 * Os serviços da equipe do produto, ligados à conexão administrativa do banco
 * de teste (`owner_teste`, não superusuário): a RLS vale para eles também.
 */
export function criarFerramentasDePlataforma(
  sobrescrever: { auditoria?: AuditoriaService } = {},
) {
  const pool = conexaoAdmin();
  const tenantDb = new TenantDb(pool);
  const relogio = new RelogioControlavel();
  const email = new MemoriaAdapter();
  const env = lerEnv({ ...process.env, ADMIN_BASE_URL: ORIGEM_ADMIN });
  const emissor = new ConvitesEmissor(relogio, email, env);
  const auditoria = sobrescrever.auditoria ?? new AuditoriaService(pool);
  return {
    tenantDb,
    relogio,
    email,
    emissor,
    auditoria,
    provisionamento: new ProvisionamentoService(
      tenantDb,
      emissor,
      auditoria,
      relogio,
    ),
    reenvio: new ReenvioConviteDonoService(tenantDb, emissor, auditoria),
  };
}

/** Extrai o token do link `…/convite/<token>` de uma mensagem de e-mail. */
export function tokenDoConvite(texto: string): string {
  const achado = /\/convite\/([A-Za-z0-9_-]+)/.exec(texto);
  if (achado?.[1] === undefined) {
    throw new Error("a mensagem não traz um link de convite");
  }
  return achado[1];
}
