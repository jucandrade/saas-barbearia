import { ResetPasswordForm } from "./reset-password-form";

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main>
      <ResetPasswordForm token={token} />
    </main>
  );
}
