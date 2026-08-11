import { redirect } from "next/navigation";
import { LuminaXApp } from "@/components/luminax/LuminaXApp";
import { getPageUser } from "@/modules/auth/auth-page";

export default async function HomePage() {
  const user = await getPageUser();
  if (!user) redirect("/login?next=/");
  return <LuminaXApp user={user} />;
}
