import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const CHAVE = "sessao";

// No navegador (Expo Web) não existe armazenamento seguro nativo; usa o localStorage.
const naWeb = Platform.OS === "web";

/** O token de sessão fica em armazenamento seguro do aparelho, nunca em texto simples. */
export async function salvarToken(token: string): Promise<void> {
  if (naWeb) {
    globalThis.localStorage.setItem(CHAVE, token);
    return;
  }
  await SecureStore.setItemAsync(CHAVE, token);
}

export async function lerToken(): Promise<string | undefined> {
  if (naWeb) {
    return globalThis.localStorage.getItem(CHAVE) ?? undefined;
  }
  return (await SecureStore.getItemAsync(CHAVE)) ?? undefined;
}

export async function apagarToken(): Promise<void> {
  if (naWeb) {
    globalThis.localStorage.removeItem(CHAVE);
    return;
  }
  await SecureStore.deleteItemAsync(CHAVE);
}
