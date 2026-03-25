import { Suspense } from "react";
import { TableOrderClient } from "./TableOrderClient";

function OrderRouteFallback() {
  return <p className="text-[var(--muted)]">Loading…</p>;
}

export default async function TableOrderPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = await params;
  return (
    <Suspense fallback={<OrderRouteFallback />}>
      <TableOrderClient tableId={tableId} />
    </Suspense>
  );
}
