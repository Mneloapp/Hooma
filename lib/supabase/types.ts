export type UserRole = "admin" | "customer";
export type ProductStatus = "active" | "draft" | "archived" | "coming_soon";
export type StockStatus = "in_stock" | "low_stock" | "preorder" | "out_of_stock" | "coming_soon";
export type OrderStatus = "pending" | "confirmed" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";
export type PaymentStatus = "unpaid" | "paid" | "failed" | "refunded";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type InventoryRow = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  sku: string;
  color: string | null;
  fabric: string | null;
  material: string | null;
  orientation: string | null;
  quantity_available: number;
  quantity_reserved: number;
  quantity_sold: number;
  low_stock_threshold: number;
  stock_status: StockStatus;
  updated_at: string;
};

export type OrderRow = {
  id: string;
  customer_id: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  delivery_fee: number;
  total: number;
  delivery_address: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerRow = {
  id: string;
  profile_id: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
};

export type OrderItemRow = {
  id: string;
  order_id: string | null;
  product_id: string | null;
  variant_id: string | null;
  inventory_id: string | null;
  product_name: string | null;
  sku: string | null;
  size_label: string | null;
  fabric: string | null;
  material: string | null;
  color: string | null;
  orientation: string | null;
  quantity: number;
  unit_price: number | null;
  total_price: number | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
      };
      inventory: {
        Row: InventoryRow;
        Insert: Partial<InventoryRow> & { sku: string };
        Update: Partial<InventoryRow>;
      };
      orders: {
        Row: OrderRow;
        Insert: Partial<OrderRow>;
        Update: Partial<OrderRow>;
      };
      customers: {
        Row: CustomerRow;
        Insert: Partial<CustomerRow>;
        Update: Partial<CustomerRow>;
      };
      order_items: {
        Row: OrderItemRow;
        Insert: Partial<OrderItemRow>;
        Update: Partial<OrderItemRow>;
      };
    };
    Functions: {
      reserve_inventory: {
        Args: { inventory_row_id: string; reserve_qty: number };
        Returns: void;
      };
      finalize_inventory_sale: {
        Args: { inventory_row_id: string; sale_qty: number };
        Returns: void;
      };
      release_inventory: {
        Args: { inventory_row_id: string; release_qty: number };
        Returns: void;
      };
    };
  };
};
