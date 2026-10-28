import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { Service } from "@barbearia/contracts";
import { BrandHeader } from "../../lib/brand-header";
import { useBrand } from "../../lib/branding";
import { confirm } from "../../lib/confirm";
import { formatPrice } from "../../lib/money";
import {
  isSessionGone,
  listServices,
  ownerMessage,
  setServiceActive,
} from "../../lib/owner";
import { eraseToken, readToken } from "../../lib/session";
import { useCommonStyles } from "../../lib/theme-styles";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; services: Service[] };

/**
 * Quick owner function: see the catalog and turn a service off or back on. Creating, editing,
 * prices and executors stay on the computer (FR-019), so there is no such action here.
 */
export default function ManageCatalog() {
  const router = useRouter();
  const s = useCommonStyles();
  const { tokens } = useBrand();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const signOutOnExpiry = useCallback(
    async (failure: unknown): Promise<boolean> => {
      if (!isSessionGone(failure)) return false;
      await eraseToken();
      router.replace("/sign-in");
      return true;
    },
    [router],
  );

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await readToken();
      if (token === undefined) {
        router.replace("/sign-in");
        return;
      }
      try {
        const loaded = await listServices(token);
        if (active) setState({ phase: "ready", services: loaded });
      } catch (failure) {
        if (!active) return;
        if (await signOutOnExpiry(failure)) return;
        setState({ phase: "error", message: ownerMessage(failure) });
      }
    })();
    return () => {
      active = false;
    };
  }, [router, signOutOnExpiry, version]);

  async function toggle(service: Service) {
    const turnOff = service.status === "active";
    if (
      turnOff &&
      !(await confirm(
        `Desativar ${service.name}?`,
        "Ele deixa de ser oferecido para novos atendimentos.",
      ))
    ) {
      return;
    }
    const token = await readToken();
    if (token === undefined) {
      router.replace("/sign-in");
      return;
    }
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await setServiceActive(token, service, !turnOff);
      setNotice(
        turnOff
          ? `${service.name} foi desativado.`
          : `${service.name} voltou a ser oferecido.`,
      );
      refresh();
    } catch (failure) {
      if (await signOutOnExpiry(failure)) return;
      // The list stays as it was: nothing is half done.
      setError(ownerMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  if (state.phase === "loading") {
    return (
      <View style={s.center}>
        <ActivityIndicator color={tokens.primary} />
      </View>
    );
  }
  if (state.phase === "error") {
    return (
      <View style={s.center}>
        <Text style={s.error} accessibilityRole="alert">
          {state.message}
        </Text>
        <Pressable
          style={s.secondaryButton}
          onPress={refresh}
          accessibilityRole="button"
        >
          <Text style={s.secondaryButtonText}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <ScrollView
      style={{ backgroundColor: tokens.background }}
      contentContainerStyle={s.scroll}
    >
      <BrandHeader />
      <Pressable
        onPress={() => {
          router.back();
        }}
        accessibilityRole="button"
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={s.link}>Voltar</Text>
      </Pressable>
      <Text style={s.title}>Catálogo</Text>
      <Text style={s.muted}>Para cadastrar ou editar, use o computador.</Text>
      {notice !== undefined && (
        <Text style={s.text} accessibilityRole="alert">
          {notice}
        </Text>
      )}
      {error !== undefined && (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      {state.services.length === 0 && (
        <Text style={s.text}>Nenhum serviço cadastrado ainda.</Text>
      )}
      {state.services.map((service) => (
        <View key={service.id} style={s.card}>
          <Text style={[s.label, { fontSize: 16 }]}>{service.name}</Text>
          <Text style={s.text}>
            {String(service.durationMinutes)} min ·{" "}
            {formatPrice(service.priceCents)}
          </Text>
          {service.status === "active" ? (
            <Text style={s.badge}>Ativo</Text>
          ) : (
            <Text style={s.muted}>Desativado</Text>
          )}
          <Pressable
            style={[s.secondaryButton, busy && s.disabled]}
            disabled={busy}
            onPress={() => void toggle(service)}
            accessibilityRole="button"
            accessibilityLabel={`${service.status === "active" ? "Desativar" : "Reativar"} ${service.name}`}
          >
            <Text style={s.secondaryButtonText}>
              {service.status === "active" ? "Desativar" : "Reativar"}
            </Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
