import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Using untyped client for flexibility
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Storage bucket name for product images
export const PRODUCT_IMAGES_BUCKET = 'product-images'

// Helper to get public URL for product images
export const getProductImageUrl = (path: string) => {
  if (!path) return null
  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path)
  return data.publicUrl
}


