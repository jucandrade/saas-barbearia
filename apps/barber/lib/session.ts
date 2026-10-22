import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "session";

// In the browser (Expo Web) there is no native secure storage; fall back to localStorage.
const onWeb = Platform.OS === "web";

/** The session token is kept in the device's secure storage, never in plain text. */
export async function saveToken(token: string): Promise<void> {
  if (onWeb) {
    globalThis.localStorage.setItem(KEY, token);
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
}

export async function readToken(): Promise<string | undefined> {
  if (onWeb) {
    return globalThis.localStorage.getItem(KEY) ?? undefined;
  }
  return (await SecureStore.getItemAsync(KEY)) ?? undefined;
}

export async function eraseToken(): Promise<void> {
  if (onWeb) {
    globalThis.localStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}
