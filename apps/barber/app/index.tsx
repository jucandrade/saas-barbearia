import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { MeOutput } from "@barbearia/contracts";
import { call, callWithoutResponse, ApiResponseError } from "../lib/api";
import { BrandHeader } from "../lib/brand-header";
import { useBrand } from "../lib/branding";
import { eraseToken, readToken } from "../lib/session";
import { useCommonStyles } from "../lib/theme-styles";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; me: MeOutput; token: string };

export default function Index() {
  const router = useRouter();
  const s = useCommonStyles();
  const { tokens } = useBrand();
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
      <View style={s.screen}>
        <ActivityIndicator color={tokens.primary} />
      </View>
    );
  }
  if (state.phase === "error") {
    return (
      <View style={s.screen}>
        <Text style={s.error} accessibilityRole="alert">
          {state.message}
        </Text>
      </View>
    );
  }
  return (
    <View style={s.screen}>
      <BrandHeader name={state.me.barbershop.name} />
      <Text style={s.text}>Olá, {state.me.user.name}.</Text>
      <Pressable
        style={s.primaryButton}
        onPress={() => {
          router.push("/catalog");
        }}
        accessibilityRole="button"
      >
        <Text style={s.primaryButtonText}>Ver serviços</Text>
      </Pressable>
      {/* Only the owner gets the quick management functions (FR-019, FR-020). */}
      {state.me.user.role === "owner" && (
        <>
          <Pressable
            style={s.secondaryButton}
            onPress={() => {
              router.push("/manage/catalog");
            }}
            accessibilityRole="button"
          >
            <Text style={s.secondaryButtonText}>Catálogo</Text>
          </Pressable>
          <Pressable
            style={s.secondaryButton}
            onPress={() => {
              router.push("/manage/team");
            }}
            accessibilityRole="button"
          >
            <Text style={s.secondaryButtonText}>Equipe</Text>
          </Pressable>
        </>
      )}
      <Pressable
        style={s.secondaryButton}
        onPress={() => void signOut(state.token)}
        accessibilityRole="button"
      >
        <Text style={s.secondaryButtonText}>Sair</Text>
      </Pressable>
    </View>
  );
}
