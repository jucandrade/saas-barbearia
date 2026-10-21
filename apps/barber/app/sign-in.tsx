import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SessionOutput, type LoginInput } from "@barbearia/contracts";
import { call, ApiResponseError } from "../lib/api";
import { saveToken } from "../lib/session";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function signIn() {
    setError(undefined);
    setSubmitting(true);
    try {
      const input: LoginInput = { email, password, client: "mobile" };
      const session = await call("/auth/login", {
        method: "POST",
        body: input,
        schema: SessionOutput,
      });
      if (session.token === undefined) {
        throw new Error("missing token");
      }
      await saveToken(session.token);
      router.replace("/");
    } catch (failure) {
      setError(
        failure instanceof ApiResponseError
          ? failure.message
          : "Algo deu errado. Tente de novo.",
      );
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Entrar</Text>
      <Text style={styles.label}>E-mail</Text>
      <TextInput
        style={styles.field}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        accessibilityLabel="E-mail"
      />
      <Text style={styles.label}>Senha</Text>
      <TextInput
        style={styles.field}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        accessibilityLabel="Senha"
      />
      {error !== undefined && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        disabled={submitting || email.length === 0 || password.length === 0}
        onPress={() => void signIn()}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.buttonText}>Entrar</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: "center", gap: 8 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  label: { fontWeight: "600" },
  field: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cfcfd8",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  error: { color: "#b3261e" },
  button: {
    minHeight: 44,
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: "#1f4fd8",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
});
