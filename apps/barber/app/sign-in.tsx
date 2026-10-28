import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SessionOutput, type LoginInput } from "@barbearia/contracts";
import { call, ApiResponseError } from "../lib/api";
import { saveToken } from "../lib/session";
import { useBrand } from "../lib/branding";
import { useCommonStyles } from "../lib/theme-styles";

export default function SignIn() {
  const router = useRouter();
  const s = useCommonStyles();
  const { tokens } = useBrand();
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
    <View style={s.screen}>
      <Text style={s.title}>Entrar</Text>
      <Text style={s.label}>E-mail</Text>
      <TextInput
        style={s.field}
        placeholderTextColor={tokens.textMuted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        accessibilityLabel="E-mail"
      />
      <Text style={s.label}>Senha</Text>
      <TextInput
        style={s.field}
        placeholderTextColor={tokens.textMuted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        accessibilityLabel="Senha"
      />
      {error !== undefined && (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <Pressable
        style={[s.primaryButton, submitting && s.disabled]}
        disabled={submitting || email.length === 0 || password.length === 0}
        onPress={() => void signIn()}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator color={tokens.onPrimary} />
        ) : (
          <Text style={s.primaryButtonText}>Entrar</Text>
        )}
      </Pressable>
    </View>
  );
}
