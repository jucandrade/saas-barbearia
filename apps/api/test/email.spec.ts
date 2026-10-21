import { describe, expect, it } from "vitest";
import { MemoriaAdapter } from "../src/identidade/email/memoria.adapter.js";
import {
  linkConvite,
  linkRecuperacao,
  modeloConvite,
  modeloRecuperacao,
} from "../src/identidade/email/modelos.js";

describe("modelos de e-mail", () => {
  it("o convite traz o link, a barbearia e a validade de 7 dias", () => {
    const link = linkConvite("http://localhost:3001", "tok123");
    expect(link).toBe("http://localhost:3001/convite/tok123");
    const { assunto, texto } = modeloConvite({
      nome: "Ana",
      barbearia: "Piloto",
      link,
    });
    expect(assunto).toContain("Piloto");
    expect(texto).toContain(link);
    expect(texto).toContain("7 dias");
  });

  it("a recuperação traz o link e a validade de 1 hora", () => {
    const link = linkRecuperacao("http://localhost:3001", "tok456");
    expect(link).toBe("http://localhost:3001/redefinir-senha/tok456");
    const { texto } = modeloRecuperacao({ nome: "Ana", link });
    expect(texto).toContain(link);
    expect(texto).toContain("1 hora");
  });
});

describe("MemoriaAdapter", () => {
  it("guarda as mensagens e acha a última por destinatário", async () => {
    const email = new MemoriaAdapter();
    await email.enviar({ para: "a@x.com", assunto: "1", texto: "um" });
    await email.enviar({ para: "b@x.com", assunto: "2", texto: "dois" });
    await email.enviar({ para: "a@x.com", assunto: "3", texto: "três" });
    expect(email.ultimaPara("a@x.com")?.assunto).toBe("3");
    expect(email.ultimaPara("c@x.com")).toBeUndefined();
  });

  it("pode simular uma falha de envio uma única vez", async () => {
    const email = new MemoriaAdapter();
    email.falharProximo = true;
    await expect(
      email.enviar({ para: "a@x.com", assunto: "x", texto: "y" }),
    ).rejects.toThrow(/SMTP/);
    await expect(
      email.enviar({ para: "a@x.com", assunto: "x", texto: "y" }),
    ).resolves.toBeUndefined();
  });
});
