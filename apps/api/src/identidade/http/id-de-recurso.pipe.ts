import { type PipeTransform } from "@nestjs/common";
import { ErroApi } from "./erro-api.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Id de recurso na URL. Um id malformado responde igual a um id inexistente
 * (404): quem erra o formato não aprende nada além de "não existe" (FR-018).
 */
export class IdDeRecursoPipe implements PipeTransform<string, string> {
  transform(valor: string): string {
    if (!UUID.test(valor)) {
      throw new ErroApi(404, "NAO_ENCONTRADO", "Recurso não encontrado.");
    }
    return valor;
  }
}
