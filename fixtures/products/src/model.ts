export interface Product {
  id: string;
  sku: string;
  name: string;
  category: 'Equipment' | 'Stationery' | 'Accessories';
  price: number;
  stock: number;
  supplier: string;
  note: string;
}

export const categories = ['Equipment', 'Stationery', 'Accessories'] as const;
export const seed: Product[] = [
  { id: 'p01', sku: 'EQ-101', name: 'Studio Monitor', category: 'Equipment', price: 249, stock: 12, supplier: 'North Supply', note: '27 inch display' },
  { id: 'p02', sku: 'ST-102', name: 'Grid Notebook', category: 'Stationery', price: 12, stock: 64, supplier: 'Paper Works', note: 'A5 dotted pages' },
  { id: 'p03', sku: 'AC-103', name: 'Cable Organizer', category: 'Accessories', price: 18, stock: 30, supplier: 'North Supply', note: 'Set of six' },
  { id: 'p04', sku: 'EQ-104', name: 'Desk Lamp', category: 'Equipment', price: 65, stock: 8, supplier: 'Bright Co', note: 'Adjustable arm' },
  { id: 'p05', sku: 'ST-105', name: 'Marker Set', category: 'Stationery', price: 24, stock: 20, supplier: 'Paper Works', note: 'Eight colors' },
  { id: 'p06', sku: 'AC-106', name: 'Laptop Sleeve', category: 'Accessories', price: 32, stock: 17, supplier: 'Field Goods', note: 'Recycled textile' },
  { id: 'p07', sku: 'EQ-107', name: 'USB Dock', category: 'Equipment', price: 89, stock: 15, supplier: 'North Supply', note: 'Six ports' },
  { id: 'p08', sku: 'ST-108', name: 'Weekly Planner', category: 'Stationery', price: 16, stock: 42, supplier: 'Paper Works', note: 'Undated edition' },
  { id: 'p09', sku: 'AC-109', name: 'Mouse Pad', category: 'Accessories', price: 14, stock: 25, supplier: 'Field Goods', note: 'Non-slip backing' },
  { id: 'p10', sku: 'EQ-110', name: 'Keyboard', category: 'Equipment', price: 79, stock: 11, supplier: 'North Supply', note: 'Compact layout' },
  { id: 'p11', sku: 'ST-111', name: 'Index Cards', category: 'Stationery', price: 7, stock: 90, supplier: 'Paper Works', note: 'Pack of 100' },
  { id: 'p12', sku: 'AC-112', name: 'Desk Tray', category: 'Accessories', price: 22, stock: 13, supplier: 'Field Goods', note: 'Stackable metal' },
  { id: 'p13', sku: 'EQ-113', name: 'Web Camera', category: 'Equipment', price: 99, stock: 9, supplier: 'North Supply', note: '1080p sensor' },
  { id: 'p14', sku: 'ST-114', name: 'Binder Clips', category: 'Stationery', price: 6, stock: 55, supplier: 'Paper Works', note: 'Assorted sizes' },
  { id: 'p15', sku: 'AC-115', name: 'Travel Pouch', category: 'Accessories', price: 28, stock: 19, supplier: 'Field Goods', note: 'Water resistant' },
];

export function matchesProduct(product: Product, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return `${product.name} ${product.sku}`.toLowerCase().includes(needle);
}

export function removeSelected(products: Product[], ids: string[]): Product[] {
  return products.filter((product) => !ids.includes(product.id));
}

export function lineTotal(price: number, quantity: number): number {
  return price * quantity;
}

export function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}
