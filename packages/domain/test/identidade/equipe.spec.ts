import { describe, expect, it } from "vitest";
import {
  podeDesativar,
  type UsuarioEquipe,
} from "../../src/identidade/equipe.js";

const dono = (
  id: string,
  situacao: UsuarioEquipe["situacao"],
): UsuarioEquipe => ({
  id,
  papel: "dono",
  situacao,
});
const barbeiro = (id: string): UsuarioEquipe => ({
  id,
  papel: "barbeiro",
  situacao: "ativo",
});

describe("podeDesativar", () => {
  it("é falso para o último dono ativo", () => {
    const ana = dono("ana", "ativo");
    expect(podeDesativar(ana, [ana, barbeiro("bia")])).toBe(false);
  });

  it("é verdadeiro quando há outro dono ativo", () => {
    const ana = dono("ana", "ativo");
    expect(podeDesativar(ana, [ana, dono("caio", "ativo")])).toBe(true);
  });

  it("um dono desativado não conta como dono ativo", () => {
    const ana = dono("ana", "ativo");
    expect(podeDesativar(ana, [ana, dono("caio", "desativado")])).toBe(false);
  });

  it("um dono convidado ainda não conta como dono ativo", () => {
    const ana = dono("ana", "ativo");
    expect(podeDesativar(ana, [ana, dono("caio", "convidado")])).toBe(false);
  });

  it("é sempre verdadeiro para barbeiro", () => {
    const bia = barbeiro("bia");
    expect(podeDesativar(bia, [bia, dono("ana", "ativo")])).toBe(true);
    expect(podeDesativar(bia, [bia])).toBe(true);
  });
});
