import { getSupabaseClient } from '@/template';

export interface Store {
  id: string;
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  logo_url: string;
  banner_url: string;
  phone: string;
  whatsapp: string;
  address: string;
  category_id: string;
  // Store-specific category (separate from product categories)
  store_category_id: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_approved: boolean;
  opening_time: string;  // 'HH:MM' 24h format
  closing_time: string;  // 'HH:MM' 24h format
  position: number;
  created_at: string;
  // Owner fields
  owner_id: string | null;
  owner_whatsapp: string;
  // Analytics counters
  views_count: number;
  whatsapp_clicks_count: number;
  rating?: number;
}

// ── بيانات وهمية للمتاجر (30 متجر) ──
export const DUMMY_STORES: Store[] = [
  // ── مطاعم ──
  {
    id: 'dummy-1',
    name: 'KFC',
    name_ar: 'KFC',
    logo_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=800&auto=format&fit=crop',
    address: 'شارع غزال - قلقيلية',
    description: 'أشهر وجبات الدجاج في فلسطين',
    description_ar: 'أشهر وجبات الدجاج في فلسطين',
    phone: '+970599000001',
    whatsapp: '+970599000001',
    opening_time: '10:00',
    closing_time: '23:00',
    is_active: true,
    is_featured: true,
    category_id: 'ad26f56d-235a-441e-a65c-7f06bdb611b6',
    store_category_id: 'food-cat',
    rating: 4.5,
    views_count: 150,
    whatsapp_clicks_count: 45,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-2',
    name: 'Eliora',
    name_ar: 'إيلورا',
    logo_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop',
    address: 'شارع نابلس - قلقيلية',
    description: 'مطعم راقٍ يقدم أشهى المأكولات',
    description_ar: 'مطعم راقٍ يقدم أشهى المأكولات',
    phone: '+970599000002',
    whatsapp: '+970599000002',
    opening_time: '09:00',
    closing_time: '22:00',
    is_active: true,
    is_featured: true,
    category_id: 'food-cat',
    store_category_id: 'food-cat',
    rating: 4.8,
    views_count: 200,
    whatsapp_clicks_count: 60,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-3',
    name: 'Al-Baik',
    name_ar: 'البيك',
    logo_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=800&auto=format&fit=crop',
    address: 'شارع المدينة - قلقيلية',
    description: 'وجبات دجاج سريعة ولذيذة',
    description_ar: 'وجبات دجاج سريعة ولذيذة',
    phone: '+970599000003',
    whatsapp: '+970599000003',
    opening_time: '11:00',
    closing_time: '00:00',
    is_active: true,
    is_featured: false,
    category_id: 'food-cat',
    store_category_id: 'food-cat',
    rating: 4.2,
    views_count: 120,
    whatsapp_clicks_count: 30,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-4',
    name: 'Pizza Hut',
    name_ar: 'بيتزا هت',
    logo_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=800&auto=format&fit=crop',
    address: 'شارع السلام - قلقيلية',
    description: 'بيتزا طازجة بجودة عالية',
    description_ar: 'بيتزا طازجة بجودة عالية',
    phone: '+970599000004',
    whatsapp: '+970599000004',
    opening_time: '12:00',
    closing_time: '01:00',
    is_active: true,
    is_featured: false,
    category_id: 'food-cat',
    store_category_id: 'food-cat',
    rating: 4.0,
    views_count: 100,
    whatsapp_clicks_count: 25,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-5',
    name: 'McDonald\'s',
    name_ar: 'ماكدونالدز',
    logo_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=800&auto=format&fit=crop',
    address: 'شارع الجلاء - قلقيلية',
    description: 'وجبات سريعة عالمية',
    description_ar: 'وجبات سريعة عالمية',
    phone: '+970599000005',
    whatsapp: '+970599000005',
    opening_time: '09:00',
    closing_time: '23:00',
    is_active: true,
    is_featured: false,
    category_id: 'food-cat',
    store_category_id: 'food-cat',
    rating: 4.3,
    views_count: 180,
    whatsapp_clicks_count: 50,
    is_approved: true,
    created_at: new Date().toISOString(),
  },

  // ── سوبرماركت ──
  {
    id: 'dummy-6',
    name: 'Al-Tawfeer Supermarket',
    name_ar: 'سوبرماركت التوفير',
    logo_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=800&auto=format&fit=crop',
    address: 'شارع المدينة - قلقيلية',
    description: 'جميع احتياجات المنزل بأسعار مميزة',
    description_ar: 'جميع احتياجات المنزل بأسعار مميزة',
    phone: '+970599000006',
    whatsapp: '+970599000006',
    opening_time: '08:00',
    closing_time: '21:00',
    is_active: true,
    is_featured: false,
    category_id: '22bca358-d3e0-4d73-9e8a-ab176385ea12',
    store_category_id: 'supermarket-cat',
    rating: 4.2,
    views_count: 120,
    whatsapp_clicks_count: 30,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-7',
    name: 'Al-Rayan Supermarket',
    name_ar: 'سوبرماركت الريان',
    logo_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=800&auto=format&fit=crop',
    address: 'شارع نابلس - قلقيلية',
    description: 'أفضل الأسعار وجودة عالية',
    description_ar: 'أفضل الأسعار وجودة عالية',
    phone: '+970599000007',
    whatsapp: '+970599000007',
    opening_time: '07:00',
    closing_time: '22:00',
    is_active: true,
    is_featured: false,
    category_id: 'supermarket-cat',
    store_category_id: 'supermarket-cat',
    rating: 4.0,
    views_count: 90,
    whatsapp_clicks_count: 20,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-8',
    name: 'Al-Masry Supermarket',
    name_ar: 'سوبرماركت المصري',
    logo_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=800&auto=format&fit=crop',
    address: 'شارع الجلاء - قلقيلية',
    description: 'سوبرماركت متكامل بأسعار منافسة',
    description_ar: 'سوبرماركت متكامل بأسعار منافسة',
    phone: '+970599000008',
    whatsapp: '+970599000008',
    opening_time: '08:00',
    closing_time: '20:00',
    is_active: true,
    is_featured: false,
    category_id: 'supermarket-cat',
    store_category_id: 'supermarket-cat',
    rating: 3.8,
    views_count: 75,
    whatsapp_clicks_count: 15,
    is_approved: true,
    created_at: new Date().toISOString(),
  },

  // ── إلكترونيات ──
  {
    id: 'dummy-9',
    name: 'Electronics World',
    name_ar: 'عالم الإلكترونيات',
    logo_url: 'https://images.unsplash.com/photo-1531297172868-942cece06ac1?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1531297172868-942cece06ac1?q=80&w=800&auto=format&fit=crop',
    address: 'شارع السلام - قلقيلية',
    description: 'جميع الأجهزة الإلكترونية بأفضل الأسعار',
    description_ar: 'جميع الأجهزة الإلكترونية بأفضل الأسعار',
    phone: '+970599000009',
    whatsapp: '+970599000009',
    opening_time: '09:00',
    closing_time: '22:00',
    is_active: true,
    is_featured: true,
    category_id: 'f5385662-4468-470c-8d97-73395d48f73d',
    store_category_id: 'electronics-cat',
    rating: 4.7,
    views_count: 250,
    whatsapp_clicks_count: 80,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-10',
    name: 'Tech Store',
    name_ar: 'متجر التقنية',
    logo_url: 'https://images.unsplash.com/photo-1531297172868-942cece06ac1?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1531297172868-942cece06ac1?q=80&w=800&auto=format&fit=crop',
    address: 'شارع نابلس - قلقيلية',
    description: 'أحدث التقنيات والابتكارات',
    description_ar: 'أحدث التقنيات والابتكارات',
    phone: '+970599000010',
    whatsapp: '+970599000010',
    opening_time: '10:00',
    closing_time: '21:00',
    is_active: true,
    is_featured: false,
    category_id: 'electronics-cat',
    store_category_id: 'electronics-cat',
    rating: 4.5,
    views_count: 180,
    whatsapp_clicks_count: 55,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-11',
    name: 'Mobile Center',
    name_ar: 'مركز الموبايل',
    logo_url: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?q=80&w=800&auto=format&fit=crop',
    address: 'شارع الجلاء - قلقيلية',
    description: 'هواتف ذكية وإكسسواراتها',
    description_ar: 'هواتف ذكية وإكسسواراتها',
    phone: '+970599000011',
    whatsapp: '+970599000011',
    opening_time: '09:00',
    closing_time: '20:00',
    is_active: true,
    is_featured: false,
    category_id: 'electronics-cat',
    store_category_id: 'electronics-cat',
    rating: 4.1,
    views_count: 140,
    whatsapp_clicks_count: 40,
    is_approved: true,
    created_at: new Date().toISOString(),
  },

  // ── ملابس ──
  {
    id: 'dummy-12',
    name: 'Fashion Boutique',
    name_ar: 'بوتيك الأناقة',
    logo_url: 'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=800&auto=format&fit=crop',
    address: 'شارع المدينة - قلقيلية',
    description: 'أحدث صيحات الموضة',
    description_ar: 'أحدث صيحات الموضة',
    phone: '+970599000012',
    whatsapp: '+970599000012',
    opening_time: '09:00',
    closing_time: '22:00',
    is_active: true,
    is_featured: false,
    category_id: '89ed7248-3aaf-43d7-bcdd-1be31ceb9cb6',
    store_category_id: 'fashion-cat',
    rating: 4.6,
    views_count: 210,
    whatsapp_clicks_count: 65,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-13',
    name: 'Men\'s Fashion',
    name_ar: 'موضة الرجال',
    logo_url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=800&auto=format&fit=crop',
    address: 'شارع نابلس - قلقيلية',
    description: 'ملابس رجالية عصرية',
    description_ar: 'ملابس رجالية عصرية',
    phone: '+970599000013',
    whatsapp: '+970599000013',
    opening_time: '10:00',
    closing_time: '21:00',
    is_active: true,
    is_featured: false,
    category_id: 'fashion-cat',
    store_category_id: 'fashion-cat',
    rating: 4.3,
    views_count: 160,
    whatsapp_clicks_count: 45,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-14',
    name: 'Kids Wear',
    name_ar: 'ملابس الأطفال',
    logo_url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?q=80&w=800&auto=format&fit=crop',
    address: 'شارع السلام - قلقيلية',
    description: 'ملابس أطفال عالية الجودة',
    description_ar: 'ملابس أطفال عالية الجودة',
    phone: '+970599000014',
    whatsapp: '+970599000014',
    opening_time: '08:00',
    closing_time: '20:00',
    is_active: true,
    is_featured: false,
    category_id: 'fashion-cat',
    store_category_id: 'fashion-cat',
    rating: 4.0,
    views_count: 110,
    whatsapp_clicks_count: 30,
    is_approved: true,
    created_at: new Date().toISOString(),
  },

  // ── مستحضرات تجميل ──
  {
    id: 'dummy-15',
    name: 'Beauty Center',
    name_ar: 'مركز التجميل',
    logo_url: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=800&auto=format&fit=crop',
    address: 'شارع المدينة - قلقيلية',
    description: 'مستحضرات تجميل أصلية من أفضل الماركات',
    description_ar: 'مستحضرات تجميل أصلية من أفضل الماركات',
    phone: '+970599000015',
    whatsapp: '+970599000015',
    opening_time: '09:00',
    closing_time: '22:00',
    is_active: true,
    is_featured: false,
    category_id: 'd86fb3c5-cdc8-4197-a8ef-22a8db8412e2',
    store_category_id: 'cosmetics-cat',
    rating: 4.8,
    views_count: 300,
    whatsapp_clicks_count: 100,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-16',
    name: 'Glow Beauty',
    name_ar: 'متجر غلو للتجميل',
    logo_url: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=800&auto=format&fit=crop',
    address: 'شارع نابلس - قلقيلية',
    description: 'مستحضرات تجميل و عطورات',
    description_ar: 'مستحضرات تجميل و عطورات',
    phone: '+970599000016',
    whatsapp: '+970599000016',
    opening_time: '10:00',
    closing_time: '21:00',
    is_active: true,
    is_featured: false,
    category_id: 'cosmetics-cat',
    store_category_id: 'cosmetics-cat',
    rating: 4.4,
    views_count: 190,
    whatsapp_clicks_count: 60,
    is_approved: true,
    created_at: new Date().toISOString(),
  },

  // ── خضروات وفواكه ──
  {
    id: 'dummy-17',
    name: 'Fresh Market',
    name_ar: 'سوق الخضار الطازج',
    logo_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=800&auto=format&fit=crop',
    address: 'شارع السلام - قلقيلية',
    description: 'خضروات وفواكه طازجة يومياً',
    description_ar: 'خضروات وفواكه طازجة يومياً',
    phone: '+970599000017',
    whatsapp: '+970599000017',
    opening_time: '06:00',
    closing_time: '19:00',
    is_active: true,
    is_featured: false,
    category_id: 'fruits-vegetables-cat',
    store_category_id: 'fruits-vegetables-cat',
    rating: 4.7,
    views_count: 270,
    whatsapp_clicks_count: 85,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-18',
    name: 'Organic Farm',
    name_ar: 'المزرعة العضوية',
    logo_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=800&auto=format&fit=crop',
    address: 'شارع المدينة - قلقيلية',
    description: 'منتجات عضوية طازجة من المزرعة',
    description_ar: 'منتجات عضوية طازجة من المزرعة',
    phone: '+970599000018',
    whatsapp: '+970599000018',
    opening_time: '07:00',
    closing_time: '18:00',
    is_active: true,
    is_featured: false,
    category_id: 'fruits-vegetables-cat',
    store_category_id: 'fruits-vegetables-cat',
    rating: 4.9,
    views_count: 320,
    whatsapp_clicks_count: 110,
    is_approved: true,
    created_at: new Date().toISOString(),
  },

  // ── صيدليات ──
  {
    id: 'dummy-19',
    name: 'Al-Shifa Pharmacy',
    name_ar: 'صيدلية الشفاء',
    logo_url: 'https://images.unsplash.com/photo-1584308666744-24d5e4a778fc?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1584308666744-24d5e4a778fc?q=80&w=800&auto=format&fit=crop',
    address: 'شارع نابلس - قلقيلية',
    description: 'صيدلية متكاملة بجميع الأدوية',
    description_ar: 'صيدلية متكاملة بجميع الأدوية',
    phone: '+970599000019',
    whatsapp: '+970599000019',
    opening_time: '08:00',
    closing_time: '22:00',
    is_active: true,
    is_featured: false,
    category_id: 'pharmacy-cat',
    store_category_id: 'pharmacy-cat',
    rating: 4.6,
    views_count: 230,
    whatsapp_clicks_count: 70,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-20',
    name: 'Al-Hayat Pharmacy',
    name_ar: 'صيدلية الحياة',
    logo_url: 'https://images.unsplash.com/photo-1584308666744-24d5e4a778fc?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1584308666744-24d5e4a778fc?q=80&w=800&auto=format&fit=crop',
    address: 'شارع الجلاء - قلقيلية',
    description: 'صيدلية متخصصة بأسعار منافسة',
    description_ar: 'صيدلية متخصصة بأسعار منافسة',
    phone: '+970599000020',
    whatsapp: '+970599000020',
    opening_time: '08:00',
    closing_time: '23:00',
    is_active: true,
    is_featured: false,
    category_id: 'pharmacy-cat',
    store_category_id: 'pharmacy-cat',
    rating: 4.3,
    views_count: 170,
    whatsapp_clicks_count: 50,
    is_approved: true,
    created_at: new Date().toISOString(),
  },

  // ── زينة وهدايا ──
  {
    id: 'dummy-21',
    name: 'Gifts & More',
    name_ar: 'هدايا وأكثر',
    logo_url: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?q=80&w=800&auto=format&fit=crop',
    address: 'شارع المدينة - قلقيلية',
    description: 'هدايا وأفكار مميزة للمناسبات',
    description_ar: 'هدايا وأفكار مميزة للمناسبات',
    phone: '+970599000021',
    whatsapp: '+970599000021',
    opening_time: '09:00',
    closing_time: '21:00',
    is_active: true,
    is_featured: false,
    category_id: 'gifts-cat',
    store_category_id: 'gifts-cat',
    rating: 4.4,
    views_count: 200,
    whatsapp_clicks_count: 60,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-22',
    name: 'Celebration',
    name_ar: 'متجر الاحتفالات',
    logo_url: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?q=80&w=800&auto=format&fit=crop',
    address: 'شارع نابلس - قلقيلية',
    description: 'كل ما تحتاجه للحفلات والمناسبات',
    description_ar: 'كل ما تحتاجه للحفلات والمناسبات',
    phone: '+970599000022',
    whatsapp: '+970599000022',
    opening_time: '10:00',
    closing_time: '20:00',
    is_active: true,
    is_featured: false,
    category_id: 'gifts-cat',
    store_category_id: 'gifts-cat',
    rating: 4.1,
    views_count: 130,
    whatsapp_clicks_count: 35,
    is_approved: true,
    created_at: new Date().toISOString(),
  },

  // ── أثاث ──
  {
    id: 'dummy-23',
    name: 'Furniture House',
    name_ar: 'بيت الأثاث',
    logo_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=800&auto=format&fit=crop',
    address: 'شارع السلام - قلقيلية',
    description: 'أثاث منزلي حديث وعصري',
    description_ar: 'أثاث منزلي حديث وعصري',
    phone: '+970599000023',
    whatsapp: '+970599000023',
    opening_time: '09:00',
    closing_time: '22:00',
    is_active: true,
    is_featured: false,
    category_id: 'furniture-cat',
    store_category_id: 'furniture-cat',
    rating: 4.2,
    views_count: 150,
    whatsapp_clicks_count: 40,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-24',
    name: 'Modern Design',
    name_ar: 'تصاميم عصرية',
    logo_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=800&auto=format&fit=crop',
    address: 'شارع الجلاء - قلقيلية',
    description: 'أثاث عصري بتصاميم فريدة',
    description_ar: 'أثاث عصري بتصاميم فريدة',
    phone: '+970599000024',
    whatsapp: '+970599000024',
    opening_time: '10:00',
    closing_time: '21:00',
    is_active: true,
    is_featured: false,
    category_id: 'furniture-cat',
    store_category_id: 'furniture-cat',
    rating: 4.5,
    views_count: 190,
    whatsapp_clicks_count: 55,
    is_approved: true,
    created_at: new Date().toISOString(),
  },

  // ── وظائف ──
  {
    id: 'dummy-25',
    name: 'Job Finder',
    name_ar: 'الباحث عن وظيفة',
    logo_url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=800&auto=format&fit=crop',
    address: 'شارع المدينة - قلقيلية',
    description: 'وظائف شاغرة في مختلف المجالات',
    description_ar: 'وظائف شاغرة في مختلف المجالات',
    phone: '+970599000025',
    whatsapp: '+970599000025',
    opening_time: '08:00',
    closing_time: '17:00',
    is_active: true,
    is_featured: false,
    category_id: 'jobs-cat',
    store_category_id: 'jobs-cat',
    rating: 4.0,
    views_count: 100,
    whatsapp_clicks_count: 25,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-26',
    name: 'Career Center',
    name_ar: 'مركز الوظائف',
    logo_url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=800&auto=format&fit=crop',
    address: 'شارع نابلس - قلقيلية',
    description: 'وظائف حكومية وخاصة',
    description_ar: 'وظائف حكومية وخاصة',
    phone: '+970599000026',
    whatsapp: '+970599000026',
    opening_time: '09:00',
    closing_time: '16:00',
    is_active: true,
    is_featured: false,
    category_id: 'jobs-cat',
    store_category_id: 'jobs-cat',
    rating: 3.9,
    views_count: 80,
    whatsapp_clicks_count: 20,
    is_approved: true,
    created_at: new Date().toISOString(),
  },

  // ── عقارات ──
  {
    id: 'dummy-27',
    name: 'Real Estate Group',
    name_ar: 'مجموعة العقارات',
    logo_url: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop',
    address: 'شارع السلام - قلقيلية',
    description: 'عقارات وشقق للبيع والإيجار',
    description_ar: 'عقارات وشقق للبيع والإيجار',
    phone: '+970599000027',
    whatsapp: '+970599000027',
    opening_time: '08:00',
    closing_time: '19:00',
    is_active: true,
    is_featured: false,
    category_id: 'real-estate-cat',
    store_category_id: 'real-estate-cat',
    rating: 4.3,
    views_count: 160,
    whatsapp_clicks_count: 45,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-28',
    name: 'Home Vision',
    name_ar: 'رؤية للعقارات',
    logo_url: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop',
    address: 'شارع الجلاء - قلقيلية',
    description: 'شقق وفيلات بأسعار مميزة',
    description_ar: 'شقق وفيلات بأسعار مميزة',
    phone: '+970599000028',
    whatsapp: '+970599000028',
    opening_time: '09:00',
    closing_time: '18:00',
    is_active: true,
    is_featured: false,
    category_id: 'real-estate-cat',
    store_category_id: 'real-estate-cat',
    rating: 4.1,
    views_count: 120,
    whatsapp_clicks_count: 30,
    is_approved: true,
    created_at: new Date().toISOString(),
  },

  // ── حيوانات ──
  {
    id: 'dummy-29',
    name: 'Pet Shop',
    name_ar: 'متجر الحيوانات الأليفة',
    logo_url: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?q=80&w=800&auto=format&fit=crop',
    address: 'شارع المدينة - قلقيلية',
    description: 'حيوانات أليفة ومستلزماتها',
    description_ar: 'حيوانات أليفة ومستلزماتها',
    phone: '+970599000029',
    whatsapp: '+970599000029',
    opening_time: '09:00',
    closing_time: '20:00',
    is_active: true,
    is_featured: false,
    category_id: 'animals-cat',
    store_category_id: 'animals-cat',
    rating: 4.8,
    views_count: 280,
    whatsapp_clicks_count: 90,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'dummy-30',
    name: 'Pet World',
    name_ar: 'عالم الحيوانات',
    logo_url: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?q=80&w=200&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?q=80&w=800&auto=format&fit=crop',
    address: 'شارع نابلس - قلقيلية',
    description: 'جميع مستلزمات الحيوانات الأليفة',
    description_ar: 'جميع مستلزمات الحيوانات الأليفة',
    phone: '+970599000030',
    whatsapp: '+970599000030',
    opening_time: '10:00',
    closing_time: '21:00',
    is_active: true,
    is_featured: false,
    category_id: 'animals-cat',
    store_category_id: 'animals-cat',
    rating: 4.6,
    views_count: 220,
    whatsapp_clicks_count: 70,
    is_approved: true,
    created_at: new Date().toISOString(),
  },
];

// ── Live status helper ────────────────────────────────────────────────────────
// Returns true if the current device time is between opening_time and closing_time.
// Handles overnight ranges (e.g. 22:00 – 02:00) correctly.
export function checkStoreIsOpen(store: Pick<Store, 'opening_time' | 'closing_time'>): boolean {
  const { opening_time, closing_time } = store;
  if (!opening_time || !closing_time) return true;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const parse = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const open = parse(opening_time);
  const close = parse(closing_time);
  return open <= close ? (cur >= open && cur < close) : (cur >= open || cur < close);
}

// ── Fetch up to 15 featured stores (shuffled client-side) ───────────────────
export async function fetchFeaturedStores(): Promise<{ data: Store[]; error: string | null }> {
  const USE_DUMMY_DATA = true; // ← أضف هذا

  if (USE_DUMMY_DATA) {
    return { data: DUMMY_STORES.filter(s => s.is_featured), error: null };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('is_active', true)
    .eq('is_featured', true)
    .order('position', { ascending: true })
    .limit(15);
  if (error) return { data: [], error: error.message };
  const arr = (data ?? []) as Store[];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { data: arr, error: null };
}

export async function fetchStoresByCategory(categoryId: string): Promise<{ data: Store[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .eq('is_approved', true)
    .order('position', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: data as Store[], error: null };
}

export async function adminFetchAllStores(): Promise<{ data: Store[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*, store_categories(id, name, name_ar, icon, color, slug)')
    .order('store_category_id', { ascending: true })
    .order('position', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: data as Store[], error: null };
}

export async function adminCreateStore(store: Omit<Store, 'id' | 'created_at'>): Promise<{ data: Store | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('stores').insert(store).select().single();
  if (error) return { data: null, error: error.message };
  return { data: data as Store, error: null };
}

export async function adminUpdateStore(id: string, updates: Partial<Store>): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('stores').update(updates).eq('id', id);
  return { error: error ? error.message : null };
}

export async function adminDeleteStore(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('stores').delete().eq('id', id);
  return { error: error ? error.message : null };
}

// ── Fetch ALL active + approved stores (for grouped feed) ─────────────────────
// Filters ONLY on is_approved so stores set is_active = true during registration
// are visible immediately after admin approval.
export async function fetchAllActiveStores(): Promise<{ data: Store[]; error: string | null }> {
  const USE_DUMMY_DATA = true; // ← غيّر إلى false عند الاتصال بقاعدة البيانات

  if (USE_DUMMY_DATA) {
    return { data: DUMMY_STORES, error: null };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*, store_category:store_categories(id, name, name_ar, icon, color, slug, position, image_url, is_active, created_at)')
    .eq('is_approved', true)
    .order('position', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: data as Store[], error: null };
}
// ── Batch-fetch all store ratings in one query ────────────────────────────────
export async function fetchAllStoreRatings(): Promise<Record<string, { avg: number; count: number }>> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('store_ratings')
    .select('store_id, rating');
  if (!data || data.length === 0) return {};
  const map: Record<string, { sum: number; count: number }> = {};
  for (const row of data) {
    if (!map[row.store_id]) map[row.store_id] = { sum: 0, count: 0 };
    map[row.store_id].sum += row.rating;
    map[row.store_id].count += 1;
  }
  const result: Record<string, { avg: number; count: number }> = {};
  for (const [id, { sum, count }] of Object.entries(map)) {
    result[id] = { avg: parseFloat((sum / count).toFixed(1)), count };
  }
  return result;
}
