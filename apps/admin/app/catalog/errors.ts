import { ApiResponseError } from "../../lib/api";

const ERROR_MESSAGES: Record<string, string> = {
  NO_PERMISSION: "Só donos podem alterar o catálogo.",
  SERVICE_NAME_TAKEN: "Já existe um serviço com esse nome.",
  CATEGORY_NAME_TAKEN: "Já existe uma categoria com esse nome.",
  CATEGORY_NOT_EMPTY:
    "Mova ou desative os serviços desta categoria antes de removê-la.",
  NOT_FOUND: "Isso não existe mais. Atualize a página.",
};

export function messageOf(error: unknown): string {
  if (error instanceof ApiResponseError) {
    return ERROR_MESSAGES[error.code] ?? error.message;
  }
  return "Algo deu errado. Tente de novo.";
}
