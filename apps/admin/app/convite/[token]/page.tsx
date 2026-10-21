import { FormularioConvite } from "./formulario-convite";

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main>
      <FormularioConvite token={token} />
    </main>
  );
}
