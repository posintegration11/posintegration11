/** GET/PUT /api/v1/settings */
export type RestaurantSettings = {
  id: string;
  name: string;
  logoUrl: string | null;
  address: string;
  gstLabel: string;
  taxPercent: string;
  invoiceFooter: string;
  currency: string;
  tableCount: number;
};

export type TableRow = {
  id: string;
  tableNumber: number;
  name: string | null;
  capacity: number | null;
  isWalkIn?: boolean;
  status: string;
  activeOrderId: string | null;
  activeTotal: number;
  openedAt: string | null;
};

/** From GET /tables/:tableId/summary */
export type TableSummary = {
  id: string;
  tableNumber: number;
  name: string | null;
  isWalkIn: boolean;
  status: string;
};

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  categoryId: string;
  category?: { name: string };
};

export type OrderItem = {
  id: string;
  menuItemId: string;
  itemNameSnapshot: string;
  itemPriceSnapshot: string;
  quantity: number;
  note: string | null;
  status: string;
  lineTotal: string;
  sentToKitchenAt: string | null;
};

/** Matches API invoice shape on orders / billing */
export type OrderInvoice = {
  id: string;
  invoiceNumber: string;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  grandTotal: string;
  paymentStatus: string;
  paymentMode: string | null;
  createdAt?: string;
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  tableId: string;
  openedAt?: string;
  status: string;
  invoices?: OrderInvoice[];
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  grandTotal: string;
  items: OrderItem[];
  table?: { tableNumber: number; name?: string | null; isWalkIn?: boolean };
};

export type KotRow = {
  id: string;
  status: string;
  createdAt: string;
  table: { tableNumber: number; name?: string | null; isWalkIn?: boolean };
  order: { id: string; orderNumber: string };
  items: {
    id: string;
    status: string;
    quantity: number;
    note: string | null;
    orderItem: OrderItem;
  }[];
};
