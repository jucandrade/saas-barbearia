import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CategoriesOutput,
  ServicesOutput,
  type Service,
  type ServiceCategory,
} from "@barbearia/contracts";
import { call, ApiResponseError } from "../lib/api";
import { formatPrice } from "../lib/money";
import { eraseToken, readToken } from "../lib/session";
import { useBrand } from "../lib/branding";
import { useCommonStyles } from "../lib/theme-styles";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      categories: ServiceCategory[];
      services: Service[];
    };

/** Read-only catalog: every active service, the barber's own ones highlighted with his values. */
export default function Catalog() {
  const router = useRouter();
  const s = useCommonStyles();
  const { tokens, fonts } = useBrand();
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
        const [categories, services] = await Promise.all([
          call("/service-categories", { token, schema: CategoriesOutput }),
          call("/services", { token, schema: ServicesOutput }),
        ]);
        if (active) {
          setState({
            phase: "ready",
            categories: categories.categories,
            services: services.services,
          });
        }
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
      </View>
    );
  }

  const shown = state.categories.filter((category) =>
    state.services.some((s) => s.categoryId === category.id),
  );
  return (
    <ScrollView
      style={{ backgroundColor: tokens.background }}
      contentContainerStyle={s.scroll}
    >
      <Pressable
        onPress={() => {
          router.back();
        }}
        accessibilityRole="button"
        style={styles.back}
      >
        <Text style={s.link}>Voltar</Text>
      </Pressable>
      <Text style={s.title}>Serviços</Text>
      {shown.length === 0 && (
        <Text style={s.text}>Nenhum serviço cadastrado ainda.</Text>
      )}
      {shown.map((category) => (
        <View key={category.id} style={styles.section}>
          <Text
            style={[
              styles.category,
              { color: tokens.text, fontFamily: fonts.displayBold },
            ]}
            accessibilityRole="header"
          >
            {category.name}
          </Text>
          {state.services
            .filter((s) => s.categoryId === category.id)
            .map((service) => (
              <View
                key={service.id}
                style={[s.card, service.mine && s.cardSelected]}
              >
                <Text
                  style={[
                    styles.name,
                    { color: tokens.text, fontFamily: fonts.bodyBold },
                  ]}
                >
                  {service.name}
                </Text>
                <Text style={s.text}>
                  {String(service.effective.durationMinutes)} min ·{" "}
                  {formatPrice(service.effective.priceCents)}
                </Text>
                {service.description !== null && (
                  <Text style={s.muted}>{service.description}</Text>
                )}
                {service.mine && <Text style={s.badge}>Você faz</Text>}
              </View>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { minHeight: 44, justifyContent: "center" },
  category: { fontSize: 18 },
  section: { marginTop: 16, gap: 8 },
  name: { fontSize: 16 },
});
