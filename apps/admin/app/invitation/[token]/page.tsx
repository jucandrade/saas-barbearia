import { InvitationForm } from "./invitation-form";

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main>
      <InvitationForm token={token} />
    </main>
  );
}
