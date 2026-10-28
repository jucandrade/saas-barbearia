"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Branding,
  MeOutput,
  type UpdateBrandingInput,
} from "@barbearia/contracts";
import {
  LOGO_TYPES,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_LOGO_BYTES,
  THEME_IDS,
  TONE_IDS,
  type ThemeId,
  type ToneId,
} from "@barbearia/domain";
import { PALETTE, THEMES, resolveBrandTokens } from "@barbearia/ui";
import { ApiResponseError, call, callBinary } from "../../lib/api";
import { useBrand } from "./branding-provider";
import { BrandingPreview } from "./branding-preview";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type Load =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready" };

const toneName = (id: ToneId): string =>
  PALETTE.find((tone) => tone.id === id)?.name ?? id;

function messageOf(error: unknown): string {
  if (error instanceof ApiResponseError) {
    return error.code === "NO_PERMISSION"
      ? "Só donos podem alterar a identidade visual."
      : error.message;
  }
  return "Algo deu errado. Tente de novo.";
}

/** Reasons to refuse a file before sending it; the server decides again by the bytes. */
function precheck(file: File): string | undefined {
  if (!LOGO_TYPES.some((type) => type === file.type)) {
    return "Use uma imagem PNG, JPEG ou WebP.";
  }
  if (file.size > MAX_LOGO_BYTES) {
    return "O logo deve ter no máximo 512 KB.";
  }
  return undefined;
}

/** Owner screen: theme, name, logo and the two colors of the closed palette, with a live preview. */
export function BrandingForm() {
  const router = useRouter();
  const { reload } = useBrand();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [name, setName] = useState("");
  const [theme, setTheme] = useState<ThemeId>("noir");
  const [primaryTone, setPrimaryTone] = useState<ToneId>("gold");
  const [accentTone, setAccentTone] = useState<ToneId>("gold");
  const [savedLogo, setSavedLogo] = useState<string | null>(null);
  const [file, setFile] = useState<File | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | undefined>();
  const [done, setDone] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const me = await call("/auth/me", { schema: MeOutput });
        if (me.user.role !== "owner") {
          router.replace("/");
          return;
        }
        const branding = await call("/branding", { schema: Branding });
        if (!active) return;
        setName(branding.name);
        setTheme(branding.theme);
        setPrimaryTone(branding.primaryTone);
        setAccentTone(branding.accentTone);
        setSavedLogo(
          branding.logoUrl === null ? null : `${API_BASE}${branding.logoUrl}`,
        );
        setLoad({ phase: "ready" });
      } catch (failure) {
        if (!active) return;
        if (failure instanceof ApiResponseError && failure.status === 401) {
          router.replace("/sign-in");
          return;
        }
        setLoad({ phase: "error", message: messageOf(failure) });
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  // The local preview of the chosen file is released when it changes and when the screen closes.
  const previewUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewUrl.current !== null) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  function choose(next: File | undefined) {
    if (previewUrl.current !== null) {
      URL.revokeObjectURL(previewUrl.current);
    }
    previewUrl.current = next === undefined ? null : URL.createObjectURL(next);
    setPreview(previewUrl.current);
    setFile(next);
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    setDone(undefined);
    if (chosen === undefined) {
      choose(undefined);
      setFileError(undefined);
      return;
    }
    const problem = precheck(chosen);
    if (problem !== undefined) {
      choose(undefined);
      setFileError(problem);
      event.target.value = "";
      return;
    }
    setFileError(undefined);
    choose(chosen);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setFieldErrors({});
    setDone(undefined);
    const input: UpdateBrandingInput = { name, theme, primaryTone, accentTone };
    try {
      const saved = await call("/branding", {
        method: "PUT",
        body: input,
        schema: Branding,
      });
      setName(saved.name);
      let logoUrl = saved.logoUrl;
      if (file !== undefined) {
        try {
          const withLogo = await callBinary("/branding/logo", {
            body: file,
            contentType: file.type,
            schema: Branding,
          });
          logoUrl = withLogo.logoUrl;
          choose(undefined);
        } catch (failure) {
          // The identity is already saved; only the logo was refused.
          setSavedLogo(logoUrl === null ? null : `${API_BASE}${logoUrl}`);
          setFileError(messageOf(failure));
          setDone("Identidade salva, mas o logo não foi enviado.");
          reload();
          return;
        }
      }
      setSavedLogo(logoUrl === null ? null : `${API_BASE}${logoUrl}`);
      setDone("Identidade visual salva. Ela já vale para toda a barbearia.");
      reload();
    } catch (failure) {
      if (failure instanceof ApiResponseError && failure.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (failure instanceof ApiResponseError) {
        setFieldErrors(failure.fields);
      }
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    if (!window.confirm("Remover o logo da barbearia?")) return;
    setBusy(true);
    setError(undefined);
    setDone(undefined);
    try {
      await call("/branding/logo", { method: "DELETE", schema: Branding });
      setSavedLogo(null);
      choose(undefined);
      setFileError(undefined);
      setDone("Logo removido.");
      reload();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  async function restoreDefault() {
    if (
      !window.confirm(
        "Restaurar o tema e as cores padrão? O nome e o logo não mudam.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(undefined);
    setDone(undefined);
    try {
      const restored = await call("/branding/reset", {
        method: "POST",
        schema: Branding,
      });
      setTheme(restored.theme);
      setPrimaryTone(restored.primaryTone);
      setAccentTone(restored.accentTone);
      setDone("Tema e cores padrão restaurados.");
      reload();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  if (load.phase === "loading") {
    return <p role="status">Carregando…</p>;
  }
  if (load.phase === "error") {
    return (
      <p role="alert" className="error">
        {load.message}
      </p>
    );
  }

  const swatch = (tone: ToneId): string =>
    resolveBrandTokens(theme, tone, tone).primary;

  function tonePicker(
    legend: string,
    group: string,
    value: ToneId,
    onChange: (tone: ToneId) => void,
  ) {
    return (
      <fieldset className="choice-group">
        <legend>{legend}</legend>
        <div className="choices">
          {TONE_IDS.map((tone) => (
            <label key={tone} className="choice">
              <input
                type="radio"
                name={group}
                value={tone}
                checked={value === tone}
                onChange={() => {
                  onChange(tone);
                  setDone(undefined);
                }}
              />
              <span
                className="swatch"
                aria-hidden="true"
                style={{ background: swatch(tone) }}
              />
              {toneName(tone)}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <form onSubmit={(event) => void save(event)} noValidate>
      <h1>Identidade visual</h1>
      <p className="hint">
        Escolha o tema, o nome, o logo e as duas cores da barbearia. Vale para o
        painel e para os apps, para você, sua equipe e seus clientes.
      </p>

      <label htmlFor="branding-name">Nome da barbearia</label>
      <input
        id="branding-name"
        value={name}
        maxLength={MAX_DISPLAY_NAME_LENGTH}
        onChange={(event) => {
          setName(event.target.value);
          setDone(undefined);
        }}
        aria-invalid={fieldErrors["name"] !== undefined}
        aria-describedby={
          fieldErrors["name"] ? "branding-name-error" : undefined
        }
      />
      {fieldErrors["name"] !== undefined && (
        <p id="branding-name-error" role="alert" className="error">
          {fieldErrors["name"]}
        </p>
      )}

      <fieldset className="choice-group">
        <legend>Tema</legend>
        <div className="choices">
          {THEME_IDS.map((id) => (
            <label key={id} className="choice">
              <input
                type="radio"
                name="theme"
                value={id}
                checked={theme === id}
                onChange={() => {
                  setTheme(id);
                  setDone(undefined);
                }}
              />
              {THEMES[id].name}
              <span className="hint-inline">
                {THEMES[id].isDark ? "escuro" : "claro"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {tonePicker("Cor principal", "primary-tone", primaryTone, setPrimaryTone)}
      {tonePicker("Cor de destaque", "accent-tone", accentTone, setAccentTone)}

      <label htmlFor="branding-logo">
        Logo (PNG, JPEG ou WebP, até 512 KB)
      </label>
      <input
        id="branding-logo"
        type="file"
        accept={LOGO_TYPES.join(",")}
        onChange={chooseFile}
        aria-describedby={fileError ? "branding-logo-error" : undefined}
      />
      {fileError !== undefined && (
        <p id="branding-logo-error" role="alert" className="error">
          {fileError}
        </p>
      )}

      {savedLogo !== null && (
        <div className="actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void removeLogo()}
          >
            Remover logo
          </button>
        </div>
      )}

      <h2>Prévia</h2>
      <BrandingPreview
        name={name}
        logoSrc={preview ?? savedLogo}
        theme={theme}
        primaryTone={primaryTone}
        accentTone={accentTone}
      />

      {error !== undefined && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {done !== undefined && (
        <p role="status" className="hint">
          {done}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "Salvando…" : "Salvar"}
      </button>
      <div className="actions">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void restoreDefault()}
        >
          Restaurar padrão
        </button>
      </div>
    </form>
  );
}
