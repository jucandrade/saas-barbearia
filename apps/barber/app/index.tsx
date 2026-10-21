import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { EuSaida } from "@barbearia/contracts";
import { chamar, chamarSemResposta, ErroDaApi } from "../lib/api";
import { apagarToken, lerToken } from "../lib/sessao";

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; eu: EuSaida; token: string };

export default function Index() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  useEffect(() => {
    let ativo = true;
    void (async () => {
      const token = await lerToken();
      if (token === undefined) {
        router.replace("/entrar");
        return;
      }
      try {
        const eu = await chamar("/auth/eu", { token, schema: EuSaida });
        if (ativo) setEstado({ fase: "pronto", eu, token });
      } catch (falha) {
        if (!ativo) return;
        if (falha instanceof ErroDaApi && falha.status === 401) {
          await apagarToken();
          router.replace("/entrar");
          return;
        }
        setEstado({
          fase: "erro",
          mensagem: falha instanceof Error ? falha.message : "Algo deu errado.",
        });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [router]);

  async function sair(token: string) {
    try {
      await chamarSemResposta("/auth/logout", token);
    } finally {
      await apagarToken();
      router.replace("/entrar");
    }
  }

  if (estado.fase === "carregando") {
    return (
      <View style={estilos.tela}>
        <ActivityIndicator />
      </View>
    );
  }
  if (estado.fase === "erro") {
    return (
      <View style={estilos.tela}>
        <Text accessibilityRole="alert">{estado.mensagem}</Text>
      </View>
    );
  }
  return (
    <View style={estilos.tela}>
      <Text style={estilos.titulo}>{estado.eu.barbearia.nome}</Text>
      <Text>Olá, {estado.eu.usuario.nome}.</Text>
      <Pressable
        style={estilos.botao}
        onPress={() => void sair(estado.token)}
        accessibilityRole="button"
      >
        <Text style={estilos.textoBotao}>Sair</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, padding: 24, justifyContent: "center", gap: 8 },
  titulo: { fontSize: 24, fontWeight: "700" },
  botao: {
    minHeight: 44,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#cfcfd8",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  textoBotao: { fontWeight: "700", fontSize: 16 },
});
