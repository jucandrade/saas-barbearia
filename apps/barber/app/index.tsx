import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MeOutput } from "@barbearia/contracts";
import { call, callWithoutResponse, ApiResponseError } from "../lib/api";
import { eraseToken, readToken } from "../lib/session";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; me: MeOutput; token: string };

export default function Index() {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await readToken();
      if (token === undefined) {
        router.replace("/sign-in");
        return;
      }
      try {
        const me = await call("/auth/me", { token, schema: MeOutput });
        if (active) setState({ phase: "ready", me, token });
      } catch (failure) {
        if (!active) return;
        if (failure instanceof ApiResponseError && failure.status === 401) {
          await eraseToken();
          router.replace("/sign-in");
          return;
        }
        setState({
          phase: "error",
          message:
            failure instanceof Error ? failure.message : "Algo deu errado.",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function signOut(token: string) {
    try {
      await callWithoutResponse("/auth/logout", token);
    } finally {
      await eraseToken();
      router.replace("/sign-in");
    }
  }

  if (state.phase === "loading") {
    return (
      <View style={styles.screen}>
        <ActivityIndicator />
      </View>
    );
  }
  if (state.phase === "error") {
    return (
      <View style={styles.screen}>
        <Text accessibilityRole="alert">{state.message}</Text>
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{state.me.barbershop.name}</Text>
      <Text>Olá, {state.me.user.name}.</Text>
      <Pressable
        style={styles.button}
        onPress={() => void signOut(state.token)}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Sair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: "center", gap: 8 },
  title: { fontSize: 24, fontWeight: "700" },
  button: {
    minHeight: 44,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#cfcfd8",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontWeight: "700", fontSize: 16 },
});
