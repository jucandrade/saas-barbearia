import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { User } from "@barbearia/contracts";
import { BrandHeader } from "../../lib/brand-header";
import { useBrand } from "../../lib/branding";
import { confirm } from "../../lib/confirm";
import {
  deactivateMember,
  isSessionGone,
  listTeam,
  ownerMessage,
  resendInvitation,
} from "../../lib/owner";
import { eraseToken, readToken } from "../../lib/session";
import { useCommonStyles } from "../../lib/theme-styles";

const STATUS_LABEL: Record<User["status"], string> = {
  invited: "Convite pendente",
  active: "Ativo",
  deactivated: "Desativado",
};

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; users: User[] };

/**
 * Quick owner function: turn a member off right now, or send a pending invitation again.
 * Inviting new people and everything else stays on the computer (FR-019). Deactivating takes
 * three taps from the home screen: Equipe, Desativar, Confirmar (SC-009).
 */
export default function ManageTeam() {
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
        const loaded = await listTeam(token);
        if (active) setState({ phase: "ready", users: loaded });
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

  async function act(
    action: (token: string) => Promise<string>,
  ): Promise<void> {
    const token = await readToken();
    if (token === undefined) {
      router.replace("/sign-in");
      return;
    }
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      setNotice(await action(token));
      refresh();
    } catch (failure) {
      if (await signOutOnExpiry(failure)) return;
      // The list stays as it was: nothing is half done.
      setError(ownerMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(user: User) {
    if (
      !(await confirm(
        `Desativar ${user.name}?`,
        "A pessoa perde o acesso agora.",
      ))
    ) {
      return;
    }
    await act(async (token) => {
      await deactivateMember(token, user);
      return `${user.name} foi desativado(a).`;
    });
  }

  async function resend(user: User) {
    await act(async (token) =>
      (await resendInvitation(token, user))
        ? `Novo convite enviado para ${user.email}.`
        : "O e-mail não pôde ser enviado. Tente de novo.",
    );
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
      <Text style={s.title}>Equipe</Text>
      <Text style={s.muted}>
        Para convidar pessoas ou editar, use o computador.
      </Text>
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
      {state.users.map((user) => (
        <View key={user.id} style={s.card}>
          <Text style={[s.label, { fontSize: 16 }]}>{user.name}</Text>
          <Text style={s.muted}>
            {user.email} · {user.role === "owner" ? "Dono" : "Barbeiro"}
          </Text>
          {user.status === "active" ? (
            <Text style={s.badge}>{STATUS_LABEL[user.status]}</Text>
          ) : (
            <Text style={s.muted}>{STATUS_LABEL[user.status]}</Text>
          )}
          {user.status === "invited" && (
            <Pressable
              style={[s.secondaryButton, busy && s.disabled]}
              disabled={busy}
              onPress={() => void resend(user)}
              accessibilityRole="button"
              accessibilityLabel={`Reenviar convite para ${user.name}`}
            >
              <Text style={s.secondaryButtonText}>Reenviar convite</Text>
            </Pressable>
          )}
          {user.status !== "deactivated" && (
            <Pressable
              style={[s.secondaryButton, busy && s.disabled]}
              disabled={busy}
              onPress={() => void deactivate(user)}
              accessibilityRole="button"
              accessibilityLabel={`Desativar ${user.name}`}
            >
              <Text style={s.secondaryButtonText}>Desativar</Text>
            </Pressable>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
