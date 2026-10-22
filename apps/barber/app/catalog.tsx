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
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (state.phase === "error") {
    return (
      <View style={styles.center}>
        <Text accessibilityRole="alert">{state.message}</Text>
      </View>
    );
  }

  const shown = state.categories.filter((category) =>
    state.services.some((s) => s.categoryId === category.id),
  );
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Pressable
        onPress={() => {
          router.back();
        }}
        accessibilityRole="button"
        style={styles.back}
      >
        <Text style={styles.backText}>Voltar</Text>
      </Pressable>
      <Text style={styles.title}>Serviços</Text>
      {shown.length === 0 && <Text>Nenhum serviço cadastrado ainda.</Text>}
      {shown.map((category) => (
        <View key={category.id} style={styles.section}>
          <Text style={styles.category} accessibilityRole="header">
            {category.name}
          </Text>
          {state.services
            .filter((s) => s.categoryId === category.id)
            .map((service) => (
              <View
                key={service.id}
                style={[styles.card, service.mine && styles.mine]}
              >
                <Text style={styles.name}>{service.name}</Text>
                <Text>
                  {String(service.effective.durationMinutes)} min ·{" "}
                  {formatPrice(service.effective.priceCents)}
                </Text>
                {service.description !== null && (
                  <Text style={styles.description}>{service.description}</Text>
                )}
                {service.mine && <Text style={styles.badge}>Você faz</Text>}
              </View>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 24, justifyContent: "center" },
  screen: { padding: 24, gap: 8 },
  back: { minHeight: 44, justifyContent: "center" },
  backText: { fontSize: 16, fontWeight: "600" },
  title: { fontSize: 24, fontWeight: "700" },
  section: { marginTop: 16, gap: 8 },
  category: { fontSize: 18, fontWeight: "700" },
  card: {
    padding: 12,
    gap: 2,
    borderWidth: 1,
    borderColor: "#cfcfd8",
    borderRadius: 8,
  },
  mine: { borderColor: "#1f4fd8", borderWidth: 2 },
  name: { fontSize: 16, fontWeight: "700" },
  description: { color: "#5b5b66" },
  badge: { marginTop: 4, color: "#1f4fd8", fontWeight: "700" },
});
