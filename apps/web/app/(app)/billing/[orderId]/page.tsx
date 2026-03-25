import { BillingClient } from "./BillingClient";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <BillingClient orderId={orderId} />;
}
