export type UserRole = "owner" | "admin" | "catalog_manager" | "production_operator" | "support" | "customer";
export type ProductStatus = "active" | "draft" | "archived" | "coming_soon";
export type StockStatus = "in_stock" | "low_stock" | "preorder" | "out_of_stock" | "coming_soon";
export type OrderStatus = "pending" | "confirmed" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";
export type PaymentStatus = "unpaid" | "paid" | "failed" | "refunded";
export type FulfillmentStatus = "order_received" | "confirmed" | "production_queued" | "in_production" | "quality_check" | "ready_for_delivery" | "out_for_delivery" | "delivered" | "cancelled";
export type PrintJobStatus = "awaiting_approval" | "queued" | "preparing" | "printing" | "paused" | "completed" | "quality_check" | "approved" | "failed" | "cancelled";
export type PrinterStatus = "offline" | "idle" | "busy" | "paused" | "maintenance" | "error";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  invited_by: string | null;
  last_login_at: string | null;
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
  tracking_code: string | null;
  fulfillment_status: FulfillmentStatus;
  promised_at: string | null;
  test_mode: boolean;
  created_at: string;
  updated_at: string;
};

export type PrinterRow = {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  serial_number_masked: string | null;
  credential_ref: string | null;
  status: PrinterStatus;
  capabilities: Record<string, unknown>;
  last_seen_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PrintJobRow = {
  id: string;
  order_item_id: string;
  printer_id: string | null;
  status: PrintJobStatus;
  unit_number: number;
  plate_number: number;
  attempt_number: number;
  retry_of_job_id: string | null;
  assigned_operator_id: string | null;
  source_url: string | null;
  source_platform: string | null;
  product_name_snapshot: string | null;
  sku_snapshot: string | null;
  variant_snapshot: string | null;
  print_profile_path: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  material: string | null;
  color: string | null;
  telemetry: Record<string, unknown>;
  operator_notes: string | null;
  lock_version: number;
  approved_by: string | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderEventRow = {
  id: string;
  order_id: string;
  event_key: string | null;
  event_type: string;
  customer_label_en: string;
  customer_label_ka: string;
  details: Record<string, unknown>;
  is_customer_visible: boolean;
  created_by: string | null;
  created_at: string;
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
      printers: {
        Row: PrinterRow;
        Insert: Partial<PrinterRow> & { name: string; model: string };
        Update: Partial<PrinterRow>;
      };
      print_jobs: {
        Row: PrintJobRow;
        Insert: Partial<PrintJobRow> & { order_item_id: string };
        Update: Partial<PrintJobRow>;
      };
      order_events: {
        Row: OrderEventRow;
        Insert: Partial<OrderEventRow> & { order_id: string; event_type: string; customer_label_en: string; customer_label_ka: string };
        Update: never;
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
