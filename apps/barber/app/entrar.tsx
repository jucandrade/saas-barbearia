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
import { SessaoSaida, type LoginEntrada } from "@barbearia/contracts";
import { chamar, ErroDaApi } from "../lib/api";
import { salvarToken } from "../lib/sessao";

export default function Entrar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    setErro(undefined);
    setEnviando(true);
    try {
      const entrada: LoginEntrada = { email, senha, cliente: "mobile" };
      const sessao = await chamar("/auth/login", {
        metodo: "POST",
        corpo: entrada,
        schema: SessaoSaida,
      });
      if (sessao.token === undefined) {
        throw new Error("sem token");
      }
      await salvarToken(sessao.token);
      router.replace("/");
    } catch (falha) {
      setErro(
        falha instanceof ErroDaApi
          ? falha.message
          : "Algo deu errado. Tente de novo.",
      );
      setEnviando(false);
    }
  }

  return (
    <View style={estilos.tela}>
      <Text style={estilos.titulo}>Entrar</Text>
      <Text style={estilos.rotulo}>E-mail</Text>
      <TextInput
        style={estilos.campo}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        accessibilityLabel="E-mail"
      />
      <Text style={estilos.rotulo}>Senha</Text>
      <TextInput
        style={estilos.campo}
        value={senha}
        onChangeText={setSenha}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        accessibilityLabel="Senha"
      />
      {erro !== undefined && (
        <Text style={estilos.erro} accessibilityRole="alert">
          {erro}
        </Text>
      )}
      <Pressable
        style={[estilos.botao, enviando && estilos.botaoDesativado]}
        disabled={enviando || email.length === 0 || senha.length === 0}
        onPress={() => void entrar()}
        accessibilityRole="button"
      >
        {enviando ? (
          <ActivityIndicator />
        ) : (
          <Text style={estilos.textoBotao}>Entrar</Text>
        )}
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, padding: 24, justifyContent: "center", gap: 8 },
  titulo: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  rotulo: { fontWeight: "600" },
  campo: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cfcfd8",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  erro: { color: "#b3261e" },
  botao: {
    minHeight: 44,
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: "#1f4fd8",
    alignItems: "center",
    justifyContent: "center",
  },
  botaoDesativado: { opacity: 0.6 },
  textoBotao: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
});
