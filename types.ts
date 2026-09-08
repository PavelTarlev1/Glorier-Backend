export type TransitType = 'own' | 'sold';

export interface CalculationRow {
  id: number;
  lc: string;
  uc: string;
  cat: string;
  city_from: string;
  city_to: string;
  post_from: string;
  post_to: string;
  company_from: string;
  company_to: string;
  transit_type: TransitType;
  ship_date: string;
  ship_time: string;
  arrival_date: string;
  arrival_time: string;
  distance: number;
  deviation_km: number;
  manual_distance_km: number | null;
  manual_price_avg: number | null;
  price_per_km: number;
  price_avg: number;
  price_lo: number;
  price_hi: number;
  empty_km: number;
  extra_cost: number;
  toll_cost: number;
  bridge_cost: number;
  ferry_cost: number;
  customs_cost: number;
  weight_kg: number;
  tail_lift: number;
  service_tags: string;
  total: number;
  confidence: string;
  sample_size: number;
  created_at: string;
}

export interface RateEntry {
  n: number;
  avg: number;
  lo: number;
  hi: number;
}
export interface RouteCatRate extends RateEntry {
  lc: string;
  uc: string;
  cat: string;
}
export interface RouteRate extends RateEntry {
  lc: string;
  uc: string;
}
export interface CategoryRate extends RateEntry {
  cat: string;
}
export type HistoryRow = [string | null, string, string, string, number, number];
export interface CatInfo {
  payload_t: number;
  ldm: number;
}
export interface RatesData {
  overall: RateEntry;
  avg_empty_ratio: number;
  route_cat: RouteCatRate[];
  route: RouteRate[];
  category: CategoryRate[];
  cat_info: Record<string, CatInfo>;
  total_records: number;
  history: HistoryRow[];
  cities: Record<string, string[]>;
  postcodes: Record<string, string[]>;
  postcode_city: Record<string, Record<string, string>>;
}
