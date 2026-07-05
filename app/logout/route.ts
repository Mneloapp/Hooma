import { logoutAction } from "@/app/auth/actions";

export async function GET() {
  await logoutAction();
}
