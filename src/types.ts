export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin';
  isActive: boolean;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  logoFileId?: string | null;
  logoUrl: string | null;
  bannerFileId?: string | null;
  bannerUrl: string | null;
  email: string;
  instagram: string;
  tiktok: string;
  whatsapp: string;
  bankInformation: string;
  storeAddress: string;
  shippingPolicy: string;
  returnPolicy: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  symbol: string;
  imageUrl: string | null;
  image_file_id?: string | null;
  sortOrder: number;
  sort_order?: number;
  isActive?: boolean;
  productCount: number;
  product_count?: number;
}

export interface ProductVariant {
  id: string;
  size: string;
  color: string;
  sku: string;
  stock: number;
  price_adjustment: number;
}

export interface ProductImage {
  id: string;
  fileId: string;
  url: string;
  altText: string;
  isPrimary: boolean;
}

export interface ProductReview {
  id: string;
  rating: number;
  comment: string;
  is_verified_purchase: number;
  created_at: string;
  author_name: string;
  product_name?: string;
  product_slug?: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  categoryName: string;
  categorySlug?: string;
  motif: string;
  material: string;
  careInstructions: string;
  price: number;
  discountPrice: number | null;
  sku: string;
  stock: number;
  soldCount: number;
  isActive?: boolean;
  isFeatured: boolean;
  primaryImageUrl: string | null;
  images?: ProductImage[];
  variants: ProductVariant[];
  reviews?: ProductReview[];
  related?: Array<{
    id: string;
    name: string;
    slug: string;
    price: number;
    discountPrice: number | null;
    motif: string;
    stock: number;
    categoryName: string;
    primaryImageUrl: string | null;
  }>;
  createdAt?: string;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  productSlug: string;
  motif: string;
  sku: string;
  variantLabel: string;
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  availableStock: number;
  isAvailable: boolean;
  subtotal: number;
  imageUrl: string | null;
}

export interface CartState {
  cartId?: string;
  items: CartItem[];
  subtotal: number;
  totalQuantity: number;
}

export interface Address {
  id: string;
  recipient_name: string;
  phone: string;
  address_line: string;
  province: string;
  city: string;
  district: string;
  postal_code: string;
  is_default: number;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  order_number?: string;
  userId: string;
  customerName: string;
  customer_name?: string;
  customerEmail: string;
  customer_email?: string;
  customerPhone: string;
  customer_phone?: string;
  shippingAddress: {
    recipientName: string;
    phone: string;
    addressLine: string;
    province: string;
    city: string;
    district: string;
    postalCode: string;
  };
  subtotal: number;
  shippingCost: number;
  shipping_cost?: number;
  discountAmount: number;
  discount_amount?: number;
  couponCode: string | null;
  totalAmount: number;
  total_amount?: number;
  paymentStatus: string;
  payment_status?: string;
  orderStatus: string;
  order_status?: string;
  customerNote: string;
  customer_note?: string;
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  items: Array<{
    id: string;
    product_id: string | null;
    product_name_snapshot: string;
    product_image_snapshot: string;
    sku_snapshot: string;
    variant_snapshot: string;
    unit_price: number;
    quantity: number;
    subtotal: number;
  }>;
  payments?: Array<{
    id: string;
    payment_method: string;
    payment_reference: string;
    amount: number;
    payment_status: string;
    admin_note: string;
    proofUrl: string | null;
    verified_at: string | null;
    created_at: string;
  }>;
  payment?: {
    id: string;
    payment_method: string;
    payment_reference: string;
    amount: number;
    payment_status: string;
    admin_note: string;
    proofUrl: string | null;
    verified_at: string | null;
  } | null;
  shipment?: {
    id: string;
    courier_name: string;
    service_name: string;
    tracking_number: string;
    shipping_cost: number;
    shipment_status: string;
    shipped_at: string | null;
    delivered_at: string | null;
  } | null;
  history: Array<{
    id: string;
    previous_status: string | null;
    new_status: string;
    note: string;
    actor_name?: string | null;
    created_at: string;
  }>;
}
